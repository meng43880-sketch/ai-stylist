'use strict';
/* features.js — умные функции sainvio одним модулем (подключается хуками из server.js, см. apply_features.js).
   Всё, что можно посчитать, считает КОД; модель — только там, где нужен текст (резюме диалога, палитра по фото).
   Данные пользователя лежат в U.ext.* (в Postgres это тот же JSON-документ пользователя), «Удалить мои данные» их стирает.
   Модуль не знает внутренностей server.js: ему нужны только req, res, путь, uid и объект пользователя U. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const R = require('./recommend');
const RV = require('./reviews');

let store = null, CFG = null, Q = null, P = null, T = null, EV = null, O = null;
const lazy = (name, mod) => { try { return require(mod); } catch (e) { return null; } };
function deps() {
  if (store) return;
  store = lazy('store', './store'); CFG = (lazy('config', './config') || {}).CFG || {};
  Q = lazy('qwen', './qwen'); P = lazy('persona', './persona'); T = lazy('taste', './taste'); EV = lazy('events', './events');
}
const orch = () => { if (!O) O = lazy('orch', './orchestrator'); return O; };

/* ---------- настройки (можно менять переменными окружения) ---------- */
const ENV = process.env;
const LIM = () => ({
  chat: Number(ENV.LIMIT_CHAT_DAY) || 60,
  vision: Number(ENV.LIMIT_VISION_DAY) || 8,
  tokens: Number(ENV.LIMIT_TOKENS_DAY) || 200000
});
const MAX_BODY = Number(ENV.MAX_IMAGE_BODY) || 2 * 1024 * 1024; // байт, для запросов с фото
const STALE_MIN = Number(ENV.FEATURES_STALE_MIN) || 900;       // через сколько минут без данных от расширения бьём тревогу. Расширение ходит раз в 6ч (360м), поэтому порог с запасом: ложных «отвалилось» из-за обычного интервала быть не должно
const MIN_GOOD = 62;                                           // порог «хороший образ» в капсуле

/* ---------- утилиты ---------- */
const now = () => Date.now();
const dayKey = (t) => new Date((t || now()) + 3 * 3600e3).toISOString().slice(0, 10); // по Москве
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const OUTER = /куртк|пальто|бомбер|ветровк|пуховик|плащ|парк[аи]|тренч|жилет|кардиган|пиджак|шуб/i;
const isOuter = (x) => x && x.cat === 'top' && OUTER.test(String(x.ownTitle || x.title || ''));
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return b; return c; };
function ext(U) {
  if (!U.ext || typeof U.ext !== 'object') U.ext = {};
  const e = U.ext;
  e.memory = e.memory || {}; e.aiFeedback = e.aiFeedback || []; e.palette = e.palette || { rejected: [], asked: 0 };
  e.outfitLog = e.outfitLog || []; e.watch = e.watch || {}; e.notes = e.notes || []; e.push = e.push || [];
  e.hintsSeen = e.hintsSeen || {}; e.quota = e.quota || { day: dayKey(), chat: 0, vision: 0, inTok: 0, outTok: 0, hits: 0 };
  e.totals = e.totals || { chat: 0, vision: 0, inTok: 0, outTok: 0, cost: 0 };
  return e;
}
function jsend(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(b);
}
function readJson(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > (max || 1.5e6)) { reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.destroy(); return; } parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('Некорректный JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function cached(ns, key, ttlMs, fn) {
  deps();
  try { const c = store && store.getCache(ns, key, ttlMs); if (c) return Promise.resolve(Object.assign({}, c, { cached: true })); } catch (e) { /* без кеша */ }
  return Promise.resolve(fn()).then((v) => { try { if (store && v) store.setCache(ns, key, v); } catch (e) { /* ignore */ } return v; });
}

/* ================= квоты, стоимость, защита ================= */
function rollDay(U) { const e = ext(U); if (e.quota.day !== dayKey()) e.quota = { day: dayKey(), chat: 0, vision: 0, inTok: 0, outTok: 0, hits: 0 }; return e.quota; }
/* kind: 'chat' | 'vision'. Возвращает {ok, left, reason}. count=true — списать единицу. */
function checkQuota(U, kind, count) {
  const q = rollDay(U), L = LIM();
  const used = q[kind] || 0, cap = L[kind];
  if (used >= cap) return { ok: false, reason: kind === 'vision' ? 'Лимит анализов фото на сегодня исчерпан — завтра обновится.' : 'На сегодня лимит вопросов стилисту исчерпан — вернись завтра, а пока можно листать ленту и образы.', left: 0, cap };
  if ((q.inTok + q.outTok) >= L.tokens) return { ok: false, reason: 'Дневной лимит нагрузки исчерпан — продолжим завтра.', left: 0, cap };
  if (count) { q[kind] = used + 1; ext(U).totals[kind] = (ext(U).totals[kind] || 0) + 1; }
  return { ok: true, left: cap - used - (count ? 1 : 0), cap };
}
/* Грубая оценка токенов по длине (1 токен ≈ 3.2 символа для русского). Точные цифры даст провайдер, но это «своя» цена на пользователя. */
function account(U, inChars, outChars, hit) {
  if (!U) return;
  const q = rollDay(U), e = ext(U);
  const i = Math.ceil((inChars || 0) / 3.2), o = Math.ceil((outChars || 0) / 3.2);
  q.inTok += i; q.outTok += o; if (hit) q.hits++;
  e.totals.inTok += i; e.totals.outTok += o;
  e.totals.cost = Math.round((e.totals.cost + (i / 1000) * (Number(ENV.COST_IN_PER_1K) || 0) + (o / 1000) * (Number(ENV.COST_OUT_PER_1K) || 0)) * 1000) / 1000;
}
function usageView(U) { const q = rollDay(U), L = LIM(); return { day: q.day, chat: { used: q.chat, cap: L.chat }, vision: { used: q.vision, cap: L.vision }, tokens: { used: q.inTok + q.outTok, cap: L.tokens }, cacheHits: q.hits }; }

/* ================= мониторинг расширения ================= */
const mon = { lastPush: 0, started: now(), alerted: 0, saved: 0, loaded: false };
function monLoad() {
  if (mon.loaded) return; deps();
  try { const c = store && store.getCache('f_mon', 'ext', 400 * 864e5); if (c && c.lastPush) mon.lastPush = c.lastPush; mon.loaded = true; } catch (e) { /* позже */ }
}
function markPush() {
  mon.lastPush = now();
  if (now() - mon.saved > 60000) { mon.saved = now(); try { deps(); store.setCache('f_mon', 'ext', { lastPush: mon.lastPush }); } catch (e) { /* ignore */ } }
}
function health() {
  monLoad();
  const base = mon.lastPush || 0;
  const ageMin = base ? Math.round((now() - base) / 60000) : null;
  const stale = base ? ageMin > STALE_MIN : (now() - mon.started) / 60000 > STALE_MIN;
  return { extension: { lastPushAt: base ? new Date(base).toISOString() : null, ageMin, staleAfterMin: STALE_MIN, stale, status: ageMin == null ? (stale ? 'no-data' : 'waiting') : (stale ? 'stale' : 'fresh') }, uptimeMin: Math.round((now() - mon.started) / 60000) };
}
async function alertIfStale() {
  const h = health();
  if (!h.extension.stale || now() - mon.alerted < 12 * 3600e3) return h;
  mon.alerted = now();
  const text = `⚠️ sainvio: расширение не присылало свежие данные ${h.extension.ageMin == null ? 'с момента запуска сервера' : Math.round(h.extension.ageMin / 60) + ' ч'}. Проверь ферму (start-farm.bat) и COLLECTOR_KEY.`;
  console.error(text);
  if (ENV.ALERT_WEBHOOK_URL) { try { await fetch(ENV.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text }) }); } catch (e) { /* webhook недоступен */ } }
  return h;
}

/* ================= гардероб как «свои вещи» ================= */
const ownOf = (w) => ({ id: 'own' + w.id, wid: w.id, own: true, ownTitle: w.title, title: w.title, price: 0, cat: w.cat, colors: w.colors || [], styles: w.styles || [], aiScore: 78, seasons: null });
const wardrobeOwn = (U) => ((U && U.wardrobe) || []).filter((w) => ['top', 'bottom', 'shoes', 'acc'].includes(w.cat)).map(ownOf);
const snap = (x) => ({ id: x.own ? x.wid : x.id, own: !!x.own, title: x.ownTitle || x.title, cat: x.cat, colors: x.colors || [], price: x.price || 0 });

/* ---- погодная поправка: холодно — нужна верхняя одежда, жарко — лишняя */
function weatherAdjust(score, set, temp, rain) {
  const outer = set.some(isOuter);
  let s = score;
  if (typeof temp === 'number') {
    if (temp <= 8) s += outer ? 4 : -14; else if (temp <= 14) s += outer ? 2 : 0; else if (temp >= 22) s -= outer ? 10 : 0;
  }
  if (rain && !set.some((x) => x.cat === 'shoes')) s -= 2;
  return clamp(Math.round(s), 0, 99);
}
/* Все сочетания верх+низ+обувь (+верхняя одежда по погоде, +лучший аксессуар). */
function combos(items, ctx) {
  ctx = ctx || {};
  const cap = (c) => items.filter((x) => x.cat === c).slice(0, 12);
  const tops = cap('top'), bottoms = cap('bottom'), shoes = cap('shoes'), accs = cap('acc').slice(0, 3);
  if (!tops.length || !bottoms.length || !shoes.length) return [];
  const outers = tops.filter(isOuter), inner = tops.filter((t) => !isOuter(t));
  const baseTops = inner.length ? inner : tops;
  const out = [], temp = ctx.temp;
  const wantOuter = typeof temp === 'number' && temp <= 10, noOuter = typeof temp === 'number' && temp >= 18;
  baseTops.forEach((t) => bottoms.forEach((b) => shoes.forEach((s) => {
    const variants = [];
    if (!outers.length || !wantOuter) variants.push([t, b, s]);
    if (outers.length && !noOuter) outers.filter((o) => o !== t).forEach((o) => variants.push([t, o, b, s]));
    variants.forEach((set) => {
      let best = set, r = R.scoreOutfit(set, { temp, budget: ctx.budget });
      accs.forEach((a) => { const s2 = set.concat([a]); const r2 = R.scoreOutfit(s2, { temp, budget: ctx.budget }); if (r2.score > r.score + 1) { best = s2; r = r2; } });
      out.push({ items: best, r, score: weatherAdjust(r.score, best, temp, ctx.rain) });
    });
  })));
  return out.sort((a, b) => b.score - a.score);
}
const comboKey = (c) => c.items.map((x) => x.id).sort().join('+');
const nameOf = (c, i) => {
  const t = c.items.find((x) => x.cat === 'top' && !isOuter(x)) || c.items[0];
  return 'Вокруг «' + String(t.ownTitle || t.title).slice(0, 22) + '»' + (i ? '' : '');
};

/* ================= журнал образов («надел», «сохранил») ================= */
function recentWorn(U, days) {
  const lim = now() - (days || 10) * 864e5;
  return ext(U).outfitLog.filter((x) => x.kind === 'worn' && x.t >= lim);
}
const idsOf = (o) => (o.items || []).map((x) => (typeof x === 'string' ? x : x.id)).filter(Boolean).map((id) => String(id).replace(/^own/, '')).sort().join('+');
/* Не повторяемся: выкидываем образы, которые пользователь недавно носил один в один. */
function avoidWorn(outfits, U, days) {
  if (!U || !outfits || !outfits.length) return outfits;
  const worn = new Set(recentWorn(U, days || 10).map((x) => idsOf(x)));
  if (!worn.size) return outfits;
  const keep = outfits.filter((o) => !worn.has(idsOf(o)));
  return keep.length ? keep : outfits;
}
function logOutfit(U, body) {
  const e = ext(U); const kind = body.kind === 'saved' ? 'saved' : 'worn';
  const items = (body.items || []).slice(0, 8).map((x) => ({ id: String(x.id || '').slice(0, 40), title: String(x.title || '').slice(0, 80), cat: x.cat || '', price: Number(x.price) || 0, own: !!x.own, img: typeof x.img === 'string' && x.img.length < 400 ? x.img : '' })).filter((x) => x.id);
  if (!items.length) throw Object.assign(new Error('Пустой образ'), { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : dayKey();
  const rec = { id: 'l' + now().toString(36) + Math.random().toString(36).slice(2, 5), kind, name: String(body.name || 'Образ').slice(0, 60), items, date, t: now() };
  /* «Надел» на ту же дату дважды не пишем */
  if (kind === 'worn') e.outfitLog = e.outfitLog.filter((x) => !(x.kind === 'worn' && x.date === date && idsOf(x) === idsOf(rec)));
  e.outfitLog.unshift(rec); e.outfitLog = e.outfitLog.slice(0, 200);
  return rec;
}

/* ================= образ только из гардероба ================= */
function wardrobeOutfit(U, profile, temp, opts) {
  opts = opts || {};
  const own = wardrobeOwn(U);
  const have = (c) => own.some((x) => x.cat === c);
  const missing = ['top', 'bottom', 'shoes'].filter((c) => !have(c));
  const RUC = { top: 'верха', bottom: 'низа', shoes: 'обуви' };
  if (missing.length) return { ok: false, missing, message: 'В гардеробе пока нет ' + missing.map((c) => RUC[c]).join(', ') + ' — добавь, и соберу образ без покупок.', outfits: [] };
  let list = combos(own, { temp, rain: opts.rain });
  list = avoidWorn(list.map((c) => Object.assign(c, { id: comboKey(c) })), U, 10);
  const picked = [];
  for (const c of list) {
    if (picked.length >= (opts.count || 3)) break;
    if (picked.every((p) => c.items.filter((x) => p.items.includes(x)).length <= Math.max(1, c.items.length - 2))) picked.push(c);
  }
  const outfits = picked.map((c, i) => ({
    id: 'wo' + i + '_' + sha(comboKey(c)).slice(0, 6), name: nameOf(c, i), items: c.items.map(snap), total: 0, score: c.score, ownCount: c.items.length,
    why: c.r.why.concat(typeof temp === 'number' && temp <= 8 && c.items.some(isOuter) ? ['есть верхняя одежда на ' + temp + '°'] : []).slice(0, 3)
  }));
  const top = outfits[0];
  const message = top ? 'Собрал из твоих вещей, ничего покупать не нужно: ' + top.items.map((x) => x.title.toLowerCase()).join(' + ') + '. ' + (top.why[0] ? top.why[0][0].toUpperCase() + top.why[0].slice(1) + '.' : '') : 'Из имеющихся вещей хорошего сочетания не получилось.';
  return { ok: true, outfits, message };
}

/* ================= капсула ================= */
function capsule(U, profile, temp, candidates) {
  const own = wardrobeOwn(U);
  const cnt = (c) => own.filter((x) => x.cat === c).length;
  const missing = ['top', 'bottom', 'shoes'].filter((c) => !cnt(c));
  const itemsView = own.map((x) => ({ id: x.wid, title: x.ownTitle, cat: x.cat, colors: x.colors }));
  if (missing.length) return { ok: false, missing, items: itemsView, message: 'Для капсулы нужны верх, низ и обувь. Пока не хватает: ' + missing.map((c) => ({ top: 'верха', bottom: 'низа', shoes: 'обуви' })[c]).join(', ') + '.' };
  const all = combos(own, { temp: null }); // капсула — «на любую погоду», без погодной поправки
  const good = all.filter((c) => c.r.score >= MIN_GOOD);
  const use = {}; own.forEach((x) => { use[x.id] = 0; });
  good.forEach((c) => c.items.forEach((x) => { use[x.id] = (use[x.id] || 0) + 1; }));
  const outfits = good.slice(0, 30).map((c, i) => ({ id: 'cap' + i, name: nameOf(c, i), ids: c.items.map((x) => x.wid), score: c.score, why: c.r.why.slice(0, 2) }));
  const weak = own.filter((x) => x.cat !== 'acc' && use[x.id] < 2).map((x) => ({ id: x.wid, title: x.ownTitle, uses: use[x.id] }));
  const strong = own.filter((x) => use[x.id] > 0).sort((a, b) => use[b.id] - use[a.id]).slice(0, 3).map((x) => ({ id: x.wid, title: x.ownTitle, uses: use[x.id] }));
  /* Что докупить, чтобы образов стало больше: считаем прирост от каждого кандидата. */
  const gains = [];
  (candidates || []).filter((c) => c && ['top', 'bottom', 'shoes'].includes(c.cat)).slice(0, 40).forEach((c) => {
    const cand = Object.assign({}, c, { own: false, aiScore: c.aiScore || 72, seasons: c.seasons || null });
    const extra = combos(own.concat([cand]), { temp: null }).filter((x) => x.items.includes(cand) && x.r.score >= MIN_GOOD).length;
    if (extra > 0) gains.push({ id: c.id, title: c.title, price: c.price, img: c.img, newOutfits: extra });
  });
  gains.sort((a, b) => b.newOutfits - a.newOutfits || a.price - b.price);
  const n = good.length;
  return { ok: true, items: itemsView, total: n, outfits, weak, strong, gains: gains.slice(0, 5),
    message: `Из ${own.length} ${plural(own.length, 'вещи', 'вещей', 'вещей')} получается ${n} ${plural(n, 'сочетание', 'сочетания', 'сочетаний')}` + (weak.length ? `. Хуже всего «${weak[0].title}» — почти ни с чем не сочетается.` : '.') };
}

/* ================= календарь образов ================= */
function calendar(U, profile, days) {
  const own = wardrobeOwn(U);
  const missing = ['top', 'bottom', 'shoes'].filter((c) => !own.some((x) => x.cat === c));
  if (missing.length) return { ok: false, missing, days: [], message: 'Для календаря нужны верх, низ и обувь в гардеробе.' };
  const worn = new Set(recentWorn(U, 7).map((x) => idsOf(x)));
  const used = []; // [{ids, i}] уже расставленные
  const out = days.map((d, i) => {
    let list = combos(own, { temp: d.temp, rain: d.rain });
    list = list.filter((c) => !worn.has(c.items.map((x) => x.wid).sort().join('+')));
    const scored = list.map((c) => {
      let pen = 0;
      used.forEach((u) => { const gap = i - u.i; const shared = c.items.filter((x) => u.ids.includes(x.wid)).length; if (gap <= 2) pen += shared * 6 / gap; else if (gap <= 4) pen += shared * 1.5; if (u.key === comboKey(c)) pen += 50; });
      return { c, s: c.score - pen };
    }).sort((a, b) => b.s - a.s);
    const pick = scored[0] && scored[0].c;
    if (!pick) return Object.assign({}, d, { outfit: null });
    used.push({ ids: pick.items.map((x) => x.wid), key: comboKey(pick), i });
    const why = pick.r.why.slice(0, 1);
    if (typeof d.temp === 'number') why.unshift(d.temp <= 8 ? (pick.items.some(isOuter) ? 'тепло: есть верхняя одежда' : 'прохладно — по возможности добавь слой') : 'по погоде ' + (d.temp > 0 ? '+' : '') + d.temp + '°');
    return Object.assign({}, d, { outfit: { name: nameOf(pick, 0), ids: pick.items.map((x) => x.wid), items: pick.items.map(snap), score: pick.score, why: why.slice(0, 2) } });
  });
  return { ok: true, days: out, message: 'Расставил образы на ' + out.length + ' ' + plural(out.length, 'день', 'дня', 'дней') + ', без повторов подряд.' };
}
/* Прогноз Open-Meteo (без ключа). Нет сети/координат — честно сообщаем, что прогноза нет. */
async function forecast(lat, lon, n) {
  n = clamp(n || 7, 1, 7);
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const key = lat.toFixed(1) + ',' + lon.toFixed(1);
  const hit = await cached('f_fc', key, 3 * 3600e3, async () => {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`, { signal: c.signal });
      if (!r.ok) return null; const j = await r.json(); const d = j.daily; if (!d || !d.time) return null;
      return { days: d.time.map((date, i) => ({ date, temp: Math.round(d.temperature_2m_max[i] * 0.6 + d.temperature_2m_min[i] * 0.4), rain: (d.precipitation_probability_max[i] || 0) >= 60 })) };
    } catch (e) { return null; } finally { clearTimeout(t); }
  });
  return hit && hit.days ? hit.days.slice(0, n) : null;
}

/* ================= замена одной вещи в образе ================= */
function replaceItem(U, profile, outfitItems, index, pool, temp) {
  const items = outfitItems.map((x) => Object.assign({}, x));
  const cur = items[index]; if (!cur) throw Object.assign(new Error('Нет такой вещи'), { status: 400 });
  const ctx = { temp, budget: (Number(profile && profile.budget) || 5000) * 2.5 };
  const have = new Set(items.map((x) => x.id));
  const dis = (U && U.feedback && U.feedback.dislikes) || {};
  const prep = (x) => Object.assign({}, x, { aiScore: x.aiScore || 70, own: !!x.own });
  const cands = (pool || []).filter((x) => x && x.id && x.cat === cur.cat && !have.has(x.id) && !dis[x.id]).map(prep);
  /* свои вещи тоже кандидаты: заменить на то, что уже есть, — лучший вариант */
  wardrobeOwn(U).filter((x) => x.cat === cur.cat && !have.has(x.id)).forEach((x) => cands.push(Object.assign(x, { price: 0, aiScore: 78 })));
  const base = R.scoreOutfit(items.map(prep), ctx).score;
  const res = cands.map((c) => {
    const set = items.map(prep); set[index] = c;
    const r = R.scoreOutfit(set, ctx);
    return { item: c, score: r.score, delta: r.score - base, why: r.why[0] || '' };
  }).sort((a, b) => b.score - a.score).slice(0, 4);
  return { base, candidates: res.map((x) => ({ item: { id: x.item.own ? x.item.wid : x.item.id, own: !!x.item.own, title: x.item.ownTitle || x.item.title, img: x.item.img || '', price: x.item.price || 0, cat: x.item.cat, colors: x.item.colors || [], aiScore: x.item.aiScore }, score: x.score, delta: x.delta, why: x.why })) };
}

/* ================= сравнение двух вещей ================= */
function reviewStatsFor(id) {
  try { deps(); const c = store.getCache('reviews', id, 14 * 864e5); if (c && c.reviews && c.reviews.length) return RV.analyze(c.reviews); } catch (e) { /* нет отзывов */ }
  return null;
}
function outfitCountWith(U, item, temp) {
  const own = wardrobeOwn(U); if (!own.length) return null;
  const cand = Object.assign({}, item, { own: false, aiScore: item.aiScore || 72, seasons: item.seasons || null });
  if (!['top', 'bottom', 'shoes'].includes(cand.cat)) return null;
  return combos(own.concat([cand]), { temp: null }).filter((c) => c.items.includes(cand) && c.r.score >= MIN_GOOD).length;
}
function compare(U, profile, a, b, statsA, statsB) {
  const rows = []; let pa = 0, pb = 0;
  const win = (ka, kb, label, better, text) => { rows.push({ label, a: ka, b: kb, win: better, text }); if (better === 'a') pa++; else if (better === 'b') pb++; };
  const pd = a.price && b.price ? Math.round((1 - a.price / b.price) * 100) : 0;
  win(a.price ? a.price + ' ₽' : '—', b.price ? b.price + ' ₽' : '—', 'Цена', Math.abs(pd) >= 5 ? (pd > 0 ? 'a' : 'b') : '', Math.abs(pd) >= 5 ? (pd > 0 ? `A дешевле на ${pd}%` : `B дешевле на ${-pd}%`) : 'цены почти равны');
  const ra = (statsA && statsA.avg) || a.rating || 0, rb = (statsB && statsB.avg) || b.rating || 0;
  if (ra && rb) win(String(ra).replace('.', ','), String(rb).replace('.', ','), 'Оценка', Math.abs(ra - rb) >= 0.2 ? (ra > rb ? 'a' : 'b') : '', Math.abs(ra - rb) >= 0.2 ? (ra > rb ? 'у A оценка выше' : 'у B оценка выше') : 'оценки близки');
  const na = (statsA && statsA.count) || a.reviews || 0, nb = (statsB && statsB.count) || b.reviews || 0;
  if (na || nb) win(String(na), String(nb), 'Отзывов', Math.max(na, nb) >= 2 * Math.max(1, Math.min(na, nb)) && Math.max(na, nb) >= 20 ? (na > nb ? 'a' : 'b') : '', 'чем больше отзывов, тем надёжнее оценка');
  const sz = (s) => (s && s.size && s.size.label !== 'нет данных' ? s.size.label : 'нет данных');
  const fitOk = (s) => (s && s.size && s.size.label === 'в размер' ? 1 : s && s.size && ['маломерит', 'большемерит'].includes(s.size.label) ? -1 : 0);
  win(sz(statsA), sz(statsB), 'Посадка', fitOk(statsA) === fitOk(statsB) ? '' : (fitOk(statsA) > fitOk(statsB) ? 'a' : 'b'), 'по словам покупателей');
  if (a.aiScore && b.aiScore) win(a.aiScore + '%', b.aiScore + '%', 'Подходит тебе', Math.abs(a.aiScore - b.aiScore) >= 4 ? (a.aiScore > b.aiScore ? 'a' : 'b') : '', 'по профилю и вкусу');
  const wa = outfitCountWith(U, a), wb = outfitCountWith(U, b);
  if (wa != null && wb != null) win(String(wa), String(wb), 'Образов с гардеробом', wa === wb ? '' : (wa > wb ? 'a' : 'b'), 'сколько хороших образов даст вместе с твоими вещами');
  const lead = pa === pb ? '' : (pa > pb ? 'a' : 'b');
  const why = rows.filter((r) => r.win === lead && r.win).map((r) => r.text);
  const other = rows.filter((r) => r.win && r.win !== lead).map((r) => r.text);
  let verdict;
  if (!lead) verdict = 'Почти равны — выбирай по вкусу и цвету.';
  else verdict = `Я бы взял ${lead === 'a' ? 'A' : 'B'}: ${why.slice(0, 3).join(', ')}.` + (other.length ? ` Зато ${other[0]}.` : '');
  return { rows, winner: lead || null, verdict, score: { a: pa, b: pb } };
}

/* ================= подбор размера ================= */
const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
function shiftSize(val, steps, cat) {
  const v = String(val || '').trim().toUpperCase();
  if (!v || !steps) return v;
  const i = LETTERS.indexOf(v === 'XXXL' ? '3XL' : v);
  if (i >= 0) return LETTERS[clamp(i + steps, 0, LETTERS.length - 1)];
  const n = parseFloat(v.replace(',', '.'));
  if (isNaN(n)) return v;
  const step = cat === 'shoes' ? 1 : (n >= 40 ? 2 : 1);
  return String(n + steps * step);
}
function letterByChest(c) { if (!c) return ''; return c < 84 ? 'XS' : c < 92 ? 'S' : c < 100 ? 'M' : c < 108 ? 'L' : c < 116 ? 'XL' : c < 124 ? 'XXL' : '3XL'; }
function sizeAdvice(product, stats, profile, measures) {
  const cat = product.cat;
  let base = cat === 'shoes' ? profile.shoeSize : cat === 'bottom' ? profile.pantsSize : profile.topSize;
  let basis = 'твой размер из профиля';
  if (!base && cat === 'top' && measures && measures.chest) { base = letterByChest(measures.chest); basis = 'по обхвату груди (ориентировочно)'; }
  if (!base) return { ok: false, message: 'Укажи свой размер в профиле — тогда подскажу.' };
  const s = stats && stats.size ? stats.size : null;
  const total = s ? s.small + s.ok + s.big : 0;
  let shift = 0, note = 'По отзывам о посадке данных нет — бери свой размер и сверься с таблицей продавца.', conf = 'low';
  if (total >= 3) {
    const top = Math.max(s.small, s.ok, s.big);
    const share = top / total;
    if (s.small === top && s.small > s.ok) { shift = 1; note = `Покупатели чаще пишут «маломерит» (${s.small} из ${total}) — возьми на размер больше.`; }
    else if (s.big === top && s.big > s.ok) { shift = -1; note = `Покупатели чаще пишут «большемерит» (${s.big} из ${total}) — можно взять на размер меньше.`; }
    else if (s.ok === top && share >= 0.5) note = `Чаще пишут «в размер» (${s.ok} из ${total}) — бери свой.`;
    else note = 'Мнения о посадке разделились — лучше сверься с таблицей размеров и своими мерками.';
    conf = total >= 8 && share >= 0.6 ? 'high' : 'mid';
  } else if (total > 0) { note = 'Отзывов о посадке мало — вывод предварительный. ' + note; }
  const rec = shiftSize(base, shift, cat);
  const sizes = (product.sizes || []).map(String);
  let inStock = true, alt = '';
  if (sizes.length && !sizes.includes(String(rec))) { inStock = false; alt = sizes.includes(String(base)) ? String(base) : ''; }
  return { ok: true, base: String(base), recommended: String(rec), shift, basis, confidence: conf, reviewsUsed: total, inStock, alt, note: note + (inStock ? '' : ` У продавца размера ${rec} сейчас нет в списке.`) };
}

/* ================= палитра по фото ================= */
const COLOR_RX = [['black', /черн|чёрн|black|графит/i], ['white', /бел|white|молочн/i], ['gray', /сер[ыаоеуй]|gr[ae]y|асфальт|мокр/i], ['beige', /беж|cream|кремов|sand|песоч|бежев/i], ['olive', /олив|хаки|khaki|olive/i], ['green', /зел[её]н|green|изумруд|бутылоч/i], ['blue', /син|голуб|blue|navy|джинс/i], ['brown', /коричн|brown|шоколад|камел|camel|терракот/i]];
function colorsInText(s) { const out = []; COLOR_RX.forEach(([k, rx]) => { if (rx.test(String(s))) out.push(k); }); return out; }
function paletteFromVision(v) {
  const found = [];
  const walk = (o, key) => {
    if (o == null) return;
    if (typeof o === 'string') { if (/color|colour|palette|цвет|палитр/i.test(key || '')) found.push(...colorsInText(o)); return; }
    if (Array.isArray(o)) { o.forEach((x) => walk(x, key)); return; }
    if (typeof o === 'object') Object.keys(o).forEach((k) => walk(o[k], /color|colour|palette|цвет|палитр/i.test(k) ? k : key));
  };
  walk(v, '');
  const cnt = {}; found.forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; });
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 4);
}
async function paletteFromImage(image) {
  deps();
  const prov = CFG && CFG.qwen && (CFG.qwen.vision || CFG.qwen.photo || CFG.qwen.stylist);
  if (!Q || !prov || !Q.isConfigured(prov)) return [];
  const key = sha(image.length + image.slice(-200));
  const r = await cached('f_pal', key, 30 * 864e5, async () => {
    try {
      const msg = await Q.chatComplete(prov, { messages: [
        { role: 'system', content: 'Ты стилист по цветотипу. По фото человека (тон кожи, цвет волос и глаз) выбери до 4 цветов одежды, которые ему идут. Выбирай ТОЛЬКО из списка: black, white, gray, beige, olive, green, blue, brown. Ответ строго JSON: {"colors":["..."]}' },
        { role: 'user', content: [{ type: 'text', text: 'Какие цвета ему идут?' }, { type: 'image_url', image_url: { url: image } }] }], tag: 'vision', maxTokens: 120, temperature: 0.1 });
      const o = P ? P.extractJSON(msg.content || '') : JSON.parse(msg.content);
      return { colors: (o.colors || []).filter((c) => R.COLOR_RU[c]).slice(0, 4) };
    } catch (e) { return null; }
  });
  return (r && r.colors) || [];
}
async function paletteSuggest(U, body) {
  const e = ext(U);
  let cols = paletteFromVision(U.vision);
  let src = 'анализ фото при регистрации';
  if (!cols.length && typeof body.image === 'string' && body.image.length > 100) {
    if (body.image.length > 1400000) throw Object.assign(new Error('Фото слишком большое'), { status: 413 });
    const qv = checkQuota(U, 'vision', true);
    if (!qv.ok) return { colors: [], limited: true, message: qv.reason };
    cols = await paletteFromImage(body.image); src = 'новый анализ фото';
  }
  const have = new Set((U.profile && U.profile.colors) || []);
  const rej = new Set(e.palette.rejected || []);
  const fresh = cols.filter((c) => !have.has(c) && !rej.has(c) && R.COLOR_RU[c]);
  return { colors: fresh.map((c) => ({ key: c, label: R.COLOR_RU[c] })), source: src };
}
function paletteConfirm(U, accept, reject) {
  const e = ext(U);
  const ok = (accept || []).filter((c) => R.COLOR_RU[c]);
  if (!U.profile) U.profile = {};
  U.profile.colors = Array.from(new Set((U.profile.colors || []).concat(ok))).slice(0, 8);
  e.palette.rejected = Array.from(new Set((e.palette.rejected || []).concat((reject || []).filter((c) => R.COLOR_RU[c])))).slice(0, 12);
  e.palette.asked = now();
  deps(); ok.forEach((c) => { try { EV && EV.logEvent && EV.logEvent(U, 'explicit', null, { dim: 'colors', key: c, like: true, why: 'photo-confirm' }); } catch (er) { /* не критично */ } });
  return { colors: U.profile.colors };
}

/* ================= 👍/👎 к ответу стилиста ================= */
function aiFeedback(U, b) {
  const e = ext(U); const v = Number(b.value) >= 1 ? 1 : -1;
  const rec = { mid: String(b.messageId || '').slice(0, 40), cid: String(b.cid || '').slice(0, 40), v, reason: String(b.reason || '').slice(0, 40), q: String(b.query || '').slice(0, 120), t: now() };
  e.aiFeedback = e.aiFeedback.filter((x) => x.mid !== rec.mid || !rec.mid); e.aiFeedback.unshift(rec); e.aiFeedback = e.aiFeedback.slice(0, 200);
  deps(); try { EV && EV.logEvent && EV.logEvent(U, 'ai_message', null, { v, reason: rec.reason }); } catch (er) { /* не критично */ }
  const up = e.aiFeedback.filter((x) => x.v > 0).length;
  return { up, down: e.aiFeedback.length - up };
}

/* ================= память диалога (резюме ~300 символов) ================= */
const MEM_EVERY = 10;
function memoryFor(U, cid) { const m = U && U.ext && U.ext.memory && U.ext.memory[cid]; return m && m.text ? m.text : ''; }
function heuristicSummary(prev, msgs, slots) {
  const asks = msgs.filter((m) => m.role === 'user' || m.role === 'me').slice(-4).map((m) => String(m.text).slice(0, 60));
  const bits = [];
  if (prev) bits.push(prev.slice(0, 140));
  if (slots && slots.category) bits.push('ищет: ' + slots.category + (slots.maxPrice ? ' до ' + slots.maxPrice + ' ₽' : ''));
  if (slots && slots.occasion) bits.push('повод: ' + slots.occasion);
  if (asks.length) bits.push('последние запросы: ' + asks.join('; '));
  return bits.join('. ').slice(0, 300);
}
/* Зовётся из стилиста после каждого ответа. Резюме обновляется раз в MEM_EVERY сообщений, фоном. */
async function afterChat(U, cid, chats, slots) {
  try {
    const e = ext(U); const m = e.memory[cid] = e.memory[cid] || { text: '', n: 0, at: 0, t: 0 };
    m.n += 2;
    if (m.n - m.at < MEM_EVERY) return;
    m.at = m.n; m.t = now();
    const recent = (chats || []).slice(-MEM_EVERY);
    let text = '';
    deps();
    if (Q && P && CFG && CFG.qwen && CFG.qwen.stylist && Q.isConfigured(CFG.qwen.stylist)) {
      try {
        const payload = JSON.stringify({ previous: m.text, messages: recent.map((x) => ({ who: x.role === 'ai' ? 'stylist' : 'user', text: String(x.text || '').slice(0, 200) })) });
        const msg = await Q.chatComplete(CFG.qwen.stylist, { messages: [
          { role: 'system', content: 'Сожми диалог стилиста с клиентом в резюме до 300 символов по-русски: что ищет, бюджет, повод, что не понравилось, что уже показывали. Только факты из диалога, без выдумок и оценок. Ответ строго JSON: {"summary":""}' },
          { role: 'user', content: [{ type: 'text', text: payload }] }], tag: 'stylist', maxTokens: 160, temperature: 0.1 });
        account(U, payload.length + 200, (msg.content || '').length);
        const o = P.extractJSON(msg.content || ''); const s = typeof o.summary === 'string' ? o.summary.trim() : '';
        if (s.length >= 20 && s.length <= 400 && P.cyrRatio(s) >= 0.6) text = s.slice(0, 320);
      } catch (er) { /* упадём в эвристику */ }
    }
    m.text = text || heuristicSummary(m.text, recent, slots);
    if (store) store.save();
  } catch (er) { /* память — не критично */ }
}

/* ================= подсказки стилиста (без запроса пользователя) ================= */
const FIT_RU = { regular: 'прямой крой', straight: 'прямой крой', oversize: 'свободный крой', loose: 'свободный крой', slim: 'приталенный крой' };
function hints(U, profile, temp) {
  deps();
  const e = ext(U), out = [], seen = e.hintsSeen, fresh = (k) => !seen[k] || now() - seen[k] > 3 * 864e5;
  const own = wardrobeOwn(U);
  if (typeof temp === 'number' && temp <= 8 && own.length && !own.some(isOuter) && fresh('cold-no-outer'))
    out.push({ key: 'cold-no-outer', icon: 'sun', text: `На улице ${temp > 0 ? '+' : ''}${temp}°, а тёплой куртки в твоём гардеробе нет.`, action: { label: 'Подобрать куртку', ask: `Подбери тёплую куртку при ${temp} градусах` } });
  if (!own.length && fresh('empty-wardrobe')) out.push({ key: 'empty-wardrobe', icon: 'hanger', text: 'Добавь 3–5 своих вещей — соберу образы без покупок и подскажу, чего не хватает.', action: { label: 'В гардероб', go: 'wardrobe' } });
  try {
    if (T && U.taste) {
      const st = T.topOf(U.taste, 'style', 1, 0.55)[0];
      if (st && R.STYLE_RU[st.key] && !((profile && profile.styles) || []).includes(st.key) && fresh('style-' + st.key))
        out.push({ key: 'style-' + st.key, icon: 'spark', text: `Ты часто смотришь «${R.STYLE_RU[st.key].toLowerCase()}». Запомнить как твой стиль?`, action: { label: 'Запомнить', accept: { type: 'style', value: st.key } } });
      const ft = T.topOf(U.taste, 'fit', 1, 0.55)[0];
      if (ft && FIT_RU[ft.key] && fresh('fit-' + ft.key))
        out.push({ key: 'fit-' + ft.key, icon: 'spark', text: `Ты часто выбираешь ${FIT_RU[ft.key]}. Запомнить?`, action: { label: 'Запомнить', accept: { type: 'fit', value: ft.key } } });
    }
  } catch (er) { /* вкус ещё не накоплен */ }
  const unread = e.notes.filter((n) => !n.read && n.type === 'price').length;
  if (unread && fresh('price-drop')) out.push({ key: 'price-drop', icon: 'heart', text: `Подешевело ${unread} ${plural(unread, 'сохранённая вещь', 'сохранённые вещи', 'сохранённых вещей')}.`, action: { label: 'Посмотреть', go: 'notifs' } });
  return out.slice(0, 2);
}
function hintAccept(U, key, accept) {
  const e = ext(U); e.hintsSeen[key] = now();
  if (!accept) return { ok: true };
  if (accept.type === 'style' && R.STYLE_RU[accept.value]) { if (!U.profile) U.profile = {}; U.profile.styles = Array.from(new Set((U.profile.styles || []).concat([accept.value]))).slice(0, 5); }
  deps(); try { if (EV && EV.logEvent && (accept.type === 'fit' || accept.type === 'style')) EV.logEvent(U, 'explicit', null, { dim: accept.type, key: accept.value, like: true, why: 'hint' }); } catch (er) { /* не критично */ }
  return { ok: true, profile: U.profile };
}

/* ================= слежение за ценой ================= */
function parseWbPrice(p) {
  if (!p) return 0;
  if (p.salePriceU) return Math.round(p.salePriceU / 100);
  let min = 0;
  (p.sizes || []).forEach((s) => { const v = s && s.price && (s.price.product || s.price.total); if (v && (!min || v < min)) min = v; });
  return Math.round(min / 100);
}
function watchSet(U, product, on, target) {
  const e = ext(U); const id = String(product.id || '');
  if (!id) throw Object.assign(new Error('Нет id'), { status: 400 });
  if (on === false) { delete e.watch[id]; return { watching: false }; }
  if (Object.keys(e.watch).length >= 50 && !e.watch[id]) throw Object.assign(new Error('Можно следить максимум за 50 вещами'), { status: 400 });
  const price = Number(product.price) || 0;
  e.watch[id] = Object.assign(e.watch[id] || { hist: [[now(), price]], price0: price, low: price }, {
    id, title: String(product.title || '').slice(0, 100), img: String(product.img || '').slice(0, 300), url: String(product.url || '').slice(0, 300), mp: product.mp || 'WB',
    nmId: product.nmId || (/^wb\d+$/.test(id) ? id.slice(2) : ''), last: price, target: Number(target) || 0, t: now() });
  return { watching: true, item: e.watch[id] };
}
function addNote(U, note) {
  const e = ext(U); e.notes.unshift(Object.assign({ id: 'n' + now().toString(36), t: now(), read: false }, note)); e.notes = e.notes.slice(0, 50);
}
/* Возвращает список новых уведомлений (для пуша). */
function priceReport(U, items) {
  const e = ext(U), fresh = [];
  (items || []).forEach((it) => {
    const w = e.watch[it.id]; const price = Number(it.price) || 0;
    if (!w || !price) return;
    const prev = w.last || price;
    if (price !== prev) { w.hist.push([now(), price]); w.hist = w.hist.slice(-30); }
    else if (!w.hist.length || now() - w.hist[w.hist.length - 1][0] > 12 * 3600e3) { w.hist.push([now(), price]); w.hist = w.hist.slice(-30); }
    w.last = price; w.checked = now();
    const drop = prev > 0 ? (prev - price) / prev : 0;
    const hitTarget = w.target && price <= w.target && prev > w.target;
    if ((drop >= 0.03 || hitTarget) && price < (w.low || Infinity) + 1) {
      const note = { type: 'price', productId: w.id, title: w.title, from: prev, to: price, text: `«${w.title.slice(0, 40)}» подешевело: ${prev} → ${price} ₽` };
      addNote(U, note); fresh.push(note);
    }
    if (price < (w.low || Infinity)) w.low = price;
  });
  return fresh;
}
let webpush = null, pushReady = false;
function pushInit() {
  if (pushReady) return !!webpush; pushReady = true;
  if (!ENV.VAPID_PUBLIC_KEY || !ENV.VAPID_PRIVATE_KEY) return false;
  try { webpush = require('web-push'); webpush.setVapidDetails(ENV.VAPID_SUBJECT || 'mailto:admin@example.com', ENV.VAPID_PUBLIC_KEY, ENV.VAPID_PRIVATE_KEY); } catch (e) { webpush = null; }
  return !!webpush;
}
async function sendPush(U, note) {
  if (!pushInit()) return 0;
  const e = ext(U); let n = 0;
  for (const sub of e.push.slice()) {
    try { await webpush.sendNotification(sub, JSON.stringify({ title: 'sainvio', body: note.text, url: '/' })); n++; }
    catch (er) { if (er && (er.statusCode === 404 || er.statusCode === 410)) e.push = e.push.filter((s) => s.endpoint !== sub.endpoint); }
  }
  return n;
}
async function refreshWatched() {
  deps(); if (!store || !store.db || ENV.FEATURES_WATCH === '0') return { checked: 0 };
  const byNm = {};
  Object.keys(store.db.data || {}).forEach((uid) => { const e = store.db.data[uid] && store.db.data[uid].ext; if (!e || !e.watch) return; Object.values(e.watch).forEach((w) => { if (w.nmId) (byNm[w.nmId] = byNm[w.nmId] || []).push(uid); }); });
  const ids = Object.keys(byNm); let checked = 0;
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(`https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${batch.join(';')}`, { signal: c.signal }); clearTimeout(t);
      if (!r.ok) continue; const j = await r.json();
      const prods = (j.data && j.data.products) || j.products || [];
      for (const p of prods) {
        const price = parseWbPrice(p); if (!price) continue; checked++;
        for (const uid of byNm[String(p.id)] || []) {
          const U = store.UD(uid); const fresh = priceReport(U, [{ id: 'wb' + p.id, price }]);
          for (const n of fresh) await sendPush(U, n);
        }
      }
    } catch (e) { /* WB не ответил — попробуем в следующий раз */ }
  }
  if (checked) store.save();
  return { checked };
}
let timers = false;
function startTimers() {
  if (timers) return; timers = true;
  const a = setInterval(() => { alertIfStale().catch(() => {}); }, 10 * 60000); if (a.unref) a.unref();
  const w = setInterval(() => { refreshWatched().catch(() => {}); }, (Number(ENV.WATCH_REFRESH_MIN) || 180) * 60000); if (w.unref) w.unref();
}

/* ================= статика: PWA и фронтенд ================= */
const STATIC = { '/features.js': 'text/javascript; charset=utf-8', '/features.css': 'text/css; charset=utf-8', '/theme.css': 'text/css; charset=utf-8', '/responsive.css': 'text/css; charset=utf-8', '/manifest.webmanifest': 'application/manifest+json', '/pwa-sw.js': 'text/javascript; charset=utf-8', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/icon-maskable-512.png': 'image/png', '/apple-touch-icon.png': 'image/png' };
let ROOT = null;
function findRoot() {
  if (ROOT) return ROOT;
  const cands = [process.cwd(), path.join(__dirname, '..', '..'), path.join(__dirname, '..', '..', '..'), path.join(__dirname, '..', 'public'), path.join(process.cwd(), '..')];
  ROOT = cands.find((d) => { try { return fs.existsSync(path.join(d, 'index.html')); } catch (e) { return false; } }) || cands[1];
  return ROOT;
}
function serveStatic(res, p) {
  const f = path.join(findRoot(), p.slice(1));
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': p === '/pwa-sw.js' ? 'no-cache' : 'public, max-age=300', 'Service-Worker-Allowed': '/' });
    res.end(buf);
  });
}

/* ================= HTTP: хуки для server.js ================= */
const BIG_PATHS = ['/api/ai/chat', '/api/analyze-photo', '/api/wardrobe', '/api/features/palette/suggest'];
const pathOf = (req) => String(req.url || '/').split('?')[0].replace(/\/{2,}/g, '/');
function handlePublic(req, res, p) {
  p = p || pathOf(req);
  try {
    startTimers();
    const method = req.method;
    if (method === 'GET' && STATIC[p]) { serveStatic(res, p); return true; }
    if (method === 'POST' && p.indexOf('/api/collector/') === 0) { res.on('finish', () => { if (res.statusCode < 300) markPush(); }); return false; }
    if (method === 'POST' && BIG_PATHS.includes(p)) {
      const len = Number(req.headers['content-length'] || 0);
      if (len > MAX_BODY) { jsend(res, 413, { ok: false, code: 'TOO_BIG', error: 'Фото слишком большое — уменьши его и попробуй снова.' }); req.resume(); return true; }
    }
    if (method === 'GET' && p === '/api/features/health') { jsend(res, 200, Object.assign({ ok: true }, health())); return true; }
    if (method === 'GET' && p === '/api/features/admin/usage') {
      if (!ENV.ADMIN_KEY || req.headers['x-admin-key'] !== ENV.ADMIN_KEY) { jsend(res, 403, { ok: false, error: 'Нет доступа' }); return true; }
      deps(); const rows = [];
      Object.keys(store.db.data || {}).forEach((uid) => { const e = store.db.data[uid] && store.db.data[uid].ext; if (e && e.totals) rows.push({ user: uid.slice(0, 6), today: e.quota && e.quota.day === dayKey() ? { chat: e.quota.chat, vision: e.quota.vision, tokens: e.quota.inTok + e.quota.outTok } : null, totals: e.totals }); });
      jsend(res, 200, { ok: true, health: health(), users: rows.sort((a, b) => (b.totals.inTok + b.totals.outTok) - (a.totals.inTok + a.totals.outTok)).slice(0, 50) }); return true;
    }
  } catch (e) { console.error('features public hook:', e.message); }
  return false;
}
function limitedChat(res, why) {
  jsend(res, 200, { ok: true, data: { intent: 'limit', limited: true, message: why, picks: [], products: [], total: 0, quick: [], question: '', suggestQuery: '', conversationId: null } });
}
function handle(req, res, uid, U) {
  if (!U) return false;
  const p = pathOf(req);
  const method = req.method;
  try {
    if (method === 'DELETE' && p === '/api/profile') { delete U.ext; return false; }
    if (method === 'POST' && (p === '/api/ai/chat' || p === '/api/analyze-photo')) {
      const kind = p === '/api/analyze-photo' ? 'vision' : 'chat';
      const c = checkQuota(U, kind, true);
      if (!c.ok) { if (kind === 'chat') limitedChat(res, c.reason); else jsend(res, 429, { ok: false, code: 'LIMIT', error: c.reason }); req.resume(); return true; }
      return false;
    }
    if (p.indexOf('/api/features/') !== 0) return false;
    route(req, res, p, uid, U).catch((e) => { const code = e.status || 500; if (code >= 500) console.error('features:', e.stack || e.message); jsend(res, code, { ok: false, error: code >= 500 ? 'Не получилось, попробуй ещё раз' : e.message }); });
    return true;
  } catch (e) { console.error('features hook:', e.message); return false; }
}
const profileOf = (U) => Object.assign({ budget: 5000 }, U.profile || {});
async function route(req, res, p, uid, U) {
  deps(); const method = req.method, e = ext(U), sub = p.slice('/api/features/'.length);
  const body = method === 'POST' ? await readJson(req, sub.indexOf('palette') === 0 ? 2e6 : 1.5e6) : {};
  const ok = (o) => { try { store.save(); } catch (er) { /* ignore */ } jsend(res, 200, Object.assign({ ok: true }, o)); };
  const temp = () => { try { const w = store.getCache('weather', 'cur', 3600 * 1000); return w && typeof w.temp === 'number' ? w.temp : null; } catch (er) { return null; } };
  switch (method + ' ' + sub) {
    case 'GET state': return ok({ usage: usageView(U), push: { enabled: pushInit(), key: ENV.VAPID_PUBLIC_KEY || '' }, watching: Object.keys(e.watch), unread: e.notes.filter((n) => !n.read).length, feedback: { up: e.aiFeedback.filter((x) => x.v > 0).length, down: e.aiFeedback.filter((x) => x.v < 0).length } });
    case 'GET hints': return ok({ hints: hints(U, profileOf(U), temp()) });
    case 'POST hints/dismiss': return ok(hintAccept(U, String(body.key || '').slice(0, 60), body.accept || null));
    case 'POST palette/suggest': return ok(await paletteSuggest(U, body));
    case 'POST palette/confirm': return ok(paletteConfirm(U, body.accept, body.reject));
    case 'POST ai-feedback': return ok(aiFeedback(U, body));
    case 'POST replace': return ok(replaceItem(U, profileOf(U), body.items || [], Number(body.index), body.pool || [], temp()));
    case 'POST wardrobe-outfit': return ok(wardrobeOutfit(U, profileOf(U), temp(), { count: 3 }));
    case 'POST capsule': return ok(capsule(U, profileOf(U), temp(), body.candidates));
    case 'POST calendar': {
      const n = clamp(Number(body.days) || 7, 1, 7);
      let fc = await forecast(Number(body.lat), Number(body.lon), n), real = !!fc;
      if (!fc) { const t0 = temp(); fc = Array.from({ length: n }, (_, i) => ({ date: dayKey(now() + i * 864e5), temp: t0, rain: false })); }
      const r = calendar(U, profileOf(U), fc);
      if (r.ok) { e.calendar = { t: now(), days: r.days.map((d) => ({ date: d.date, temp: d.temp, rain: d.rain, outfit: d.outfit && { name: d.outfit.name, ids: d.outfit.ids, score: d.outfit.score } })) }; }
      return ok(Object.assign(r, { forecast: real, note: real ? '' : 'Прогноз недоступен — использую текущую температуру на все дни.' }));
    }
    case 'POST compare': {
      const a = body.a || {}, b = body.b || {};
      if (!a.id || !b.id) throw Object.assign(new Error('Нужны две вещи'), { status: 400 });
      return ok(compare(U, profileOf(U), a, b, reviewStatsFor(a.id), reviewStatsFor(b.id)));
    }
    case 'POST size': { const pr = body.product || {}; return ok(sizeAdvice(pr, reviewStatsFor(pr.id), profileOf(U), (U.measures || body.measures || null))); }
    case 'POST outfits/log': return ok({ entry: logOutfit(U, body) });
    case 'GET outfits/log': return ok({ log: e.outfitLog.slice(0, 60) });
    case 'POST outfits/log/delete': e.outfitLog = e.outfitLog.filter((x) => x.id !== body.id); return ok({});
    case 'POST price/watch': return ok(watchSet(U, body.product || {}, body.on !== false, body.target));
    case 'GET price/list': return ok({ items: Object.values(e.watch).sort((a, b) => b.t - a.t) });
    case 'POST price/report': { const fresh = priceReport(U, (body.items || []).slice(0, 50)); for (const n of fresh) await sendPush(U, n); return ok({ notes: fresh }); }
    case 'GET notes': return ok({ notes: e.notes.slice(0, 30) });
    case 'POST notes/read': e.notes.forEach((n) => { n.read = true; }); return ok({});
    case 'GET push/key': return ok({ enabled: pushInit(), key: ENV.VAPID_PUBLIC_KEY || '' });
    case 'POST push/subscribe': {
      const s = body.subscription; if (!s || !s.endpoint) throw Object.assign(new Error('Нет подписки'), { status: 400 });
      e.push = e.push.filter((x) => x.endpoint !== s.endpoint).concat([s]).slice(-3); return ok({ stored: true, enabled: pushInit() });
    }
    default: jsend(res, 404, { ok: false, error: 'Не найдено' });
  }
}

module.exports = {
  handlePublic, handle, ext, checkQuota, account, usageView, health, alertIfStale, markPush,
  combos, capsule, calendar, forecast, replaceItem, compare, sizeAdvice, wardrobeOutfit, wardrobeOwn,
  paletteFromVision, paletteSuggest, paletteConfirm, aiFeedback, memoryFor, afterChat, heuristicSummary,
  hints, hintAccept, parseWbPrice, watchSet, priceReport, refreshWatched, avoidWorn, logOutfit, recentWorn, cached,
  shiftSize, letterByChest, weatherAdjust, isOuter
};
