'use strict';
/* recommend.js v2 — детерминированный Recommendation Engine.
   Что изменилось относительно v1:
   - факторы без данных = null (а не выдуманные 70/92); итог считается только по известным,
     вместе с ним возвращается confidence (aiConf, 0..1);
   - атрибуты живых товаров (посадка, сезон, цвет) выводятся из названия (enrichItem);
   - buildOutfits перебирает комбинации и оценивает сочетаемость цветов, стиль, бюджет, погоду;
   - reasonsFor() даёт реальные «почему подходит / на что обратить внимание» из данных;
   - экспорт обратно совместим с v1. */
const { CFG } = require('./config');
const STYLE_RU = { casual: 'Повседневный', smart: 'Smart casual', street: 'Streetwear', minimal: 'Минимализм', sport: 'Sport', oldmoney: 'Old money', business: 'Business casual', classic: 'Classic', tech: 'Techwear', oversize: 'Oversize', party: 'На выход' };
const COLOR_RU = { black: 'Чёрный', white: 'Белый', olive: 'Оливковый', beige: 'Бежевый', gray: 'Серый', green: 'Тёмно-зелёный', blue: 'Синий', brown: 'Коричневый' };
const FIT_RU = { relaxed: 'свободный', slim: 'приталенный', straight: 'прямой', regular: 'обычный' };
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const ru = (n) => Number(n).toLocaleString('ru-RU');

function fitScore(fit, build) {
  const t = {
    athletic: { regular: 95, straight: 95, relaxed: 90, slim: 70 },
    slim: { regular: 90, straight: 88, slim: 92, relaxed: 75 },
    plus: { relaxed: 95, straight: 90, regular: 80, slim: 45 },
    average: { regular: 92, straight: 90, relaxed: 85, slim: 72 }
  };
  return (t[build] && t[build][fit]) || 80;
}
function currentSeason(d) {
  const m = (d || new Date()).getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}
function normTitle(t) { return String(t).toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim(); }

/* ---------- Атрибуты живых товаров из названия ---------- */
const FIT_MARKERS = [
  [/оверсайз|oversize|свободн|широк|бойфренд|мешковат|baggy/, 'relaxed'],
  [/слим|slim|зауж|облегающ|скинни|skinny|приталенн|узк(ий|ие|ая)/, 'slim'],
  [/прям(ой|ые|ого|ым)|straight/, 'straight']
];
const WARM_RE = /утеплен|зимн|пуховик|флис|на меху|мехов|термо|шерст|овчин|тепл(ый|ая|ое|ые)|стеган/;
const LIGHT_RE = /летн|льнян|лен\b|легк(ий|ая|ое|ие)|шорт|майк|сандал|шлепан|купальн|дышащ|тонк/;
const COLOR_WORDS = [['графит', 'gray'], ['молочн', 'white'], ['пудр', 'beige'], ['кремов', 'beige'], ['песочн', 'beige'], ['хаки', 'olive'], ['оливк', 'olive'], ['изумруд', 'green'], ['бутылочн', 'green'], ['джинсов', 'blue'], ['шоколад', 'brown'], ['черн', 'black'], ['бел', 'white'], ['сер', 'gray'], ['беж', 'beige'], ['коричн', 'brown'], ['син', 'blue'], ['голуб', 'blue'], ['зелен', 'green']];
function isExt(p) { return !!(p && (p.live || p.dataset || p.community || p.source)); }
function enrichItem(p) {
  if (!p || p.__enriched || !isExt(p)) return p;
  const t = String(p.title || '').toLowerCase().replace(/ё/g, 'е');
  const o = Object.assign({}, p, { __enriched: true });
  if (p.fitKnown === undefined) {
    const m = FIT_MARKERS.find(([re]) => re.test(t));
    if (m) { o.fit = m[1]; o.fitKnown = true; }
    else if (p.fit && p.fit !== 'regular') o.fitKnown = true;
    else { o.fit = p.fit || 'regular'; o.fitKnown = false; }
  }
  const hasSeasons = Array.isArray(p.seasons) && p.seasons.length > 0 && p.seasons.length < 4;
  if (!hasSeasons) {
    if (WARM_RE.test(t)) o.seasons = ['autumn', 'winter'];
    else if (LIGHT_RE.test(t)) o.seasons = ['spring', 'summer'];
    else o.seasons = null;
  }
  if (!(p.colors || []).length) {
    const cs = [];
    COLOR_WORDS.forEach(([k, v]) => { if (t.includes(k) && !cs.includes(v)) cs.push(v); });
    o.colors = cs.slice(0, 2);
  }
  return o;
}
/* Какие сезоны «подходят» под температуру. */
function tempSeasons(t) {
  if (t <= 6) return ['winter'];
  if (t <= 15) return ['autumn', 'spring'];
  if (t <= 22) return ['spring', 'summer', 'autumn'];
  return ['summer'];
}
/* Повод → стили, которые под него подходят. */
const OCCASION_STYLES = {
  office: ['smart', 'business', 'classic'], business: ['smart', 'business', 'classic'],
  date: ['smart', 'party', 'oldmoney'], party: ['party', 'street'],
  walk: ['casual', 'sport', 'minimal'], sport: ['sport'], school: ['casual', 'minimal'], weekend: ['casual', 'street', 'minimal']
};
const WEIGHT_KEYS = ['style', 'color', 'body', 'size', 'budget', 'pref', 'quality', 'season', 'wardrobe'];

/* ctx: {profile, feedback, season, temp, occasion, analyses, wardrobe[], favorites[]} */
function scoreProduct(p0, ctx) {
  const p = enrichItem(p0);
  const profile = ctx.profile || {};
  const fb = Object.assign({ styleW: {}, colorW: {}, likes: {}, dislikes: {} }, ctx.feedback || {});
  const W = ctx.weights || CFG.weights;
  const pst = p.styles || [], pco = p.colors || [], psz = p.sizes || [];
  const pStyles = profile.styles || [];
  const occSt = OCCASION_STYLES[ctx.occasion] || [];
  const wanted = pStyles.concat(occSt.filter((s) => !pStyles.includes(s)));
  const parts = {};

  /* style */
  if (pst.length && wanted.length) {
    const hit = pst.filter((s) => wanted.includes(s)).length;
    let v = 55 + Math.round(45 * (hit / Math.max(1, Math.min(2, wanted.length))));
    pst.forEach((s) => { v += (fb.styleW[s] || 0); });
    parts.style = clamp(v);
  } else parts.style = null;
  /* color */
  const pColors = profile.colors || [];
  if (pco.length && pColors.length) {
    const chit = pco.filter((c) => pColors.includes(c)).length;
    let v = chit > 0 ? 88 + Math.min(10, chit * 5) : 58;
    pco.forEach((c) => { v += (fb.colorW[c] || 0); });
    parts.color = clamp(v);
  } else parts.color = null;
  /* body (посадка) — только если крой известен */
  parts.body = (p.fitKnown !== false && p.fit) ? fitScore(p.fit, profile.build) : null;
  /* size */
  const need = p.cat === 'shoes' ? String(profile.shoeSize || '') : p.cat === 'bottom' ? String(profile.pantsSize || '') : String(profile.topSize || '');
  parts.size = need ? ((psz.includes(need) || psz.includes('One')) ? 100 : 42) : null;
  /* budget */
  const b = Number(profile.budget) || 5000;
  parts.budget = p.own ? 100 : (p.price <= b ? 100 : p.price <= b * 1.25 ? 68 : 40);
  /* pref: только реальные сигналы (лайк/дизлайк/сходство с гардеробом) */
  let pref = null;
  if (fb.likes && fb.likes[p.id]) pref = 100;
  else if (fb.dislikes && fb.dislikes[p.id]) pref = 30;
  const wr = ctx.wardrobe || [];
  if (wr.length && !(fb.dislikes && fb.dislikes[p.id]) && pref == null) {
    let aff = 0;
    wr.forEach((w) => {
      aff += (w.styles || []).filter((s) => pst.includes(s)).length * 3 + (w.colors || []).filter((c) => pco.includes(c)).length * 2;
    });
    if (aff > 0) pref = 72 + Math.min(10, aff);
  }
  parts.pref = pref == null ? null : clamp(pref);
  /* quality */
  const an = ctx.analyses && ctx.analyses[p.id];
  if (an && an.quality_signals) parts.quality = clamp((an.quality_signals.material + an.quality_signals.reviews) / 2);
  else if (p.rating > 0) parts.quality = clamp((p.rating / 5) * 100 - 3);
  else parts.quality = null;
  /* season / weather — только если сезоны товара известны */
  const known = Array.isArray(p.seasons) && p.seasons.length > 0 && p.seasons.length < 4;
  if (known) {
    const want = (typeof ctx.temp === 'number') ? tempSeasons(ctx.temp) : [ctx.season || currentSeason()];
    parts.season = p.seasons.some((s) => want.includes(s)) ? 92 : 50;
  } else parts.season = null;
  /* wardrobe compatibility */
  const wr2 = ctx.wardrobe || [];
  let compat = null, compatItems = [];
  if (wr2.length) {
    const haveCats = {};
    wr2.forEach((w) => { if (w.cat) haveCats[w.cat] = true; });
    compat = 55;
    wr2.forEach((w) => {
      const ss = (w.styles || []).filter((s) => pst.includes(s)).length;
      const cc = (w.colors || []).filter((c) => pco.includes(c)).length;
      const v = 55 + ss * 12 + cc * 8 + (p.cat && !haveCats[p.cat] ? 8 : 0);
      if (v > compat) { compat = v; compatItems = [(w.id || w.title || '').slice(0, 40)]; }
    });
    compat = clamp(compat);
  }
  parts.wardrobe = compat;
  const redund = redundancy(p, wr2.concat(ctx.favorites || []));
  /* итог: по известным факторам, веса нормируются */
  let sum = 0, wsum = 0, all = 0;
  WEIGHT_KEYS.forEach((k) => {
    const w = W[k] || 0; all += w;
    if (parts[k] != null) { sum += parts[k] * w; wsum += w; }
  });
  const conf = all ? wsum / all : 0;
  let score = wsum ? sum / wsum : 50;
  score = clamp(score - redund.score * 8);
  return { score: Math.max(20, Math.min(98, score)), parts, conf: Math.round(conf * 100) / 100, compatItems, redund };
}
function redundancy(p, items) {
  const pst = p.styles || [], pco = p.colors || [];
  let sim = 0; const ids = [];
  (items || []).forEach((w) => {
    if (!w || typeof w !== 'object' || (w.cat && p.cat && w.cat !== p.cat)) return;
    const ss = (w.styles || []).filter((s) => pst.includes(s)).length;
    const cc = (w.colors || []).filter((c) => pco.includes(c)).length;
    if (ss + cc >= 2) { sim++; if (w.id || w.title) ids.push(String(w.id || w.title).slice(0, 40)); }
  });
  return { score: Math.min(1, sim / 3), ids: ids.slice(0, 2) };
}
function rankProducts(products, ctx) {
  const seen = new Set();
  const out = [];
  products.forEach((p) => {
    const k = normTitle(p.title) + '|' + p.cat;
    if (seen.has(k)) return;
    seen.add(k);
    const r = scoreProduct(p, ctx);
    out.push(Object.assign({}, p, { aiScore: r.score, aiParts: r.parts, aiConf: r.conf, compatItems: r.compatItems, redund: r.redund }));
  });
  return out.sort((a, b) => b.aiScore - a.aiScore);
}

/* ---------- «Почему подходит» из реальных данных ---------- */
function reasonsFor(p0, profile, ctx) {
  const p = enrichItem(p0);
  profile = profile || {}; ctx = ctx || {};
  const why = [], warn = [];
  const pColors = profile.colors || [], pStyles = profile.styles || [];
  const cHit = (p.colors || []).filter((c) => pColors.includes(c));
  if (cHit.length) why.push('цвет из твоей палитры: ' + COLOR_RU[cHit[0]].toLowerCase());
  const sHit = (p.styles || []).filter((s) => pStyles.includes(s));
  if (sHit.length) why.push('твой стиль: ' + STYLE_RU[sHit[0]].toLowerCase());
  const need = p.cat === 'shoes' ? profile.shoeSize : p.cat === 'bottom' ? profile.pantsSize : profile.topSize;
  if (need) {
    if ((p.sizes || []).includes(String(need))) why.push('есть твой размер ' + need);
    else if (!(p.sizes || []).includes('One') && (p.sizes || []).length) warn.push('размера ' + need + ' нет в наличии');
  }
  const b = Number(profile.budget) || 0;
  if (!p.own && b) {
    if (p.price <= b) why.push('в бюджете');
    else if (p.price <= b * 1.25) warn.push('чуть выше бюджета');
  }
  if (typeof ctx.temp === 'number' && Array.isArray(p.seasons) && p.seasons.length && p.seasons.length < 4) {
    const ok = p.seasons.some((s) => tempSeasons(ctx.temp).includes(s));
    const t = (ctx.temp > 0 ? '+' : '') + ctx.temp + '°';
    if (ok) why.push('подходит к погоде (' + t + ')'); else warn.push('не для такой погоды (' + t + ')');
  }
  if (p.rating >= 4.7 && p.reviews >= 100) why.push('рейтинг ' + String(p.rating).replace('.', ',') + ' на ' + ru(p.reviews) + ' оценках');
  else if (p.rating > 0 && p.rating < 4.2) warn.push('рейтинг ниже 4,2');
  if (p.redund && p.redund.score > 0.6) warn.push('похожее уже есть в гардеробе');
  else if ((p.compatItems || []).length) why.push('сочетается с вещами из гардероба');
  return { why: why.slice(0, 3), warn: warn.slice(0, 2) };
}

/* ---------- Образы ---------- */
const NEUTRAL = ['black', 'white', 'gray', 'beige'];
const PAIR = {
  'beige|brown': 0.9, 'black|brown': 0.35, 'blue|brown': 0.55, 'black|blue': 0.6, 'blue|white': 1, 'blue|gray': 0.85,
  'beige|blue': 0.9, 'beige|olive': 1, 'brown|olive': 0.85, 'olive|white': 0.95, 'gray|olive': 0.8, 'green|olive': 0.55,
  'blue|green': 0.5, 'beige|green': 0.9, 'brown|green': 0.7, 'green|white': 0.9, 'gray|green': 0.8, 'black|olive': 0.8,
  'black|green': 0.8, 'blue|olive': 0.55, 'black|white': 1
};
function colorCompat(a, b) {
  if (!a || !b) return 0.7;
  if (a === b) return NEUTRAL.includes(a) ? 1 : 0.8;
  const k = [a, b].sort().join('|');
  if (PAIR[k] != null) return PAIR[k];
  if (NEUTRAL.includes(a) || NEUTRAL.includes(b)) return 0.9;
  return 0.5;
}
const primary = (x) => (x.colors && x.colors[0]) || null;
function scoreOutfit(items, ctx) {
  ctx = ctx || {};
  const core = items.filter((x) => ['top', 'bottom', 'shoes'].includes(x.cat));
  const market = items.filter((x) => !x.own);
  const avg = market.length ? market.reduce((s, x) => s + (x.aiScore || 70), 0) / market.length : 75;
  const cols = core.map(primary);
  let ps = 0, pn = 0;
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) { ps += colorCompat(cols[i], cols[j]); pn++; }
  const color = pn ? ps / pn : 0.7;
  const accents = [...new Set(cols.filter((c) => c && !NEUTRAL.includes(c)))];
  const accentPen = accents.length >= 3 ? 0.25 : accents.length === 2 ? 0.1 : 0;
  const freq = {};
  items.forEach((x) => (x.styles || []).forEach((s) => { freq[s] = (freq[s] || 0) + 1; }));
  let dom = null, best = 0;
  Object.keys(freq).forEach((s) => { if (freq[s] > best) { best = freq[s]; dom = s; } });
  const coh = dom ? best / items.length : 0.6;
  const total = market.reduce((s, x) => s + (x.price || 0), 0);
  let budgetF = 0.8;
  if (ctx.budget) budgetF = total <= ctx.budget ? 1 : total <= ctx.budget * 1.25 ? 0.6 : 0.3;
  let weatherF = 0.7;
  if (typeof ctx.temp === 'number') {
    const want = tempSeasons(ctx.temp);
    const chk = items.filter((x) => ['top', 'shoes'].includes(x.cat) && Array.isArray(x.seasons) && x.seasons.length && x.seasons.length < 4);
    weatherF = chk.length ? chk.filter((x) => x.seasons.some((s) => want.includes(s))).length / chk.length : 0.7;
  }
  const own = items.filter((x) => x.own);
  const ownBonus = Math.min(6, own.length * 3);
  const raw = 100 * (0.35 * avg / 100 + 0.30 * Math.max(0, color - accentPen) + 0.15 * coh + 0.10 * budgetF + 0.10 * weatherF) + ownBonus;
  const score = Math.max(40, Math.min(98, Math.round(raw)));
  const why = [];
  if (color >= 0.8) why.push(accents.length === 1 ? 'нейтральная база и один акцент — ' + COLOR_RU[accents[0]].toLowerCase() : 'спокойная палитра без лишних акцентов');
  if (ctx.budget && budgetF === 1) why.push('в бюджете: ' + ru(total) + ' ₽');
  if (dom && coh >= 0.66) why.push('единый стиль: ' + (STYLE_RU[dom] || dom).toLowerCase());
  if (typeof ctx.temp === 'number' && weatherF >= 0.9) why.push('подходит к погоде (' + (ctx.temp > 0 ? '+' : '') + ctx.temp + '°)');
  if (own.length) why.push('в образе твои вещи: ' + own.map((x) => String(x.ownTitle || x.title).slice(0, 24)).join(', '));
  return { score, color, dom, total, why: why.slice(0, 3), ownCount: own.length };
}
/* opts: {wardrobe, temp, budget}. Возвращает [{id,name,items:[id],total,score,why,ownCount}]. */
function buildOutfits(ranked, profile, count, opts) {
  opts = opts || {};
  const pool = (c) => {
    const mk = ranked.filter((p) => p.cat === c && !p.own).sort((a, b) => b.aiScore - a.aiScore).slice(0, 7);
    const own = ranked.filter((p) => p.cat === c && p.own).slice(0, 3);
    return mk.concat(own);
  };
  const tops = pool('top'), bottoms = pool('bottom'), shoes = pool('shoes'), accs = pool('acc').slice(0, 3);
  if (!tops.length || !bottoms.length || !shoes.length) return [];
  const ctx = { temp: opts.temp, budget: opts.budget };
  const cands = [];
  tops.forEach((t) => bottoms.forEach((b) => shoes.forEach((s) => {
    const base = [t, b, s];
    let bestSet = base, bestR = scoreOutfit(base, ctx);
    accs.forEach((a) => {
      const set = base.concat([a]); const r = scoreOutfit(set, ctx);
      if (r.score > bestR.score + 1) { bestSet = set; bestR = r; }
    });
    cands.push({ items: bestSet, r: bestR });
  })));
  cands.sort((a, b) => b.r.score - a.r.score);
  const n = Math.min(count || 3, 4), chosen = [];
  for (const c of cands) {
    if (chosen.length >= n) break;
    const ids = c.items.map((x) => x.id);
    const ok = chosen.every((o) => ids.filter((id) => o.ids.includes(id)).length <= Math.max(1, ids.length - 2));
    if (ok) chosen.push({ ids, c });
  }
  return chosen.map((o, i) => {
    const r = o.c.r, own = o.c.items.filter((x) => x.own);
    const name = own.length ? 'Вокруг «' + String(own[0].ownTitle || own[0].title).slice(0, 22) + '»'
      : ((STYLE_RU[r.dom] || 'Базовый') + ' образ' + (i ? ' №' + (i + 1) : ''));
    return { id: 'auto' + i, name, items: o.ids, total: r.total, score: r.score, why: r.why, ownCount: r.ownCount };
  });
}

/* Controlled diversity: топ + новое + похожее на лайки + exploration. */
function feedMix(ranked, feedback, daySeed) {
  const liked = Object.keys((feedback && feedback.likes) || {});
  const likedStyles = new Set();
  ranked.filter((p) => liked.includes(p.id)).forEach((p) => p.styles.forEach((s) => likedStyles.add(s)));
  const top = ranked.slice(0, 4);
  const topIds = new Set(top.map((p) => p.id));
  const rest = ranked.filter((p) => !topIds.has(p.id));
  const similar = rest.filter((p) => p.styles.some((s) => likedStyles.has(s))).slice(0, 4);
  const simIds = new Set(similar.map((p) => p.id));
  const pool = rest.filter((p) => !simIds.has(p.id));
  const rot = daySeed % Math.max(1, pool.length);
  const fresh = pool.slice(rot).concat(pool.slice(0, rot)).slice(0, 4);
  const freshIds = new Set(fresh.map((p) => p.id));
  const explore = pool.filter((p) => !freshIds.has(p.id)).slice(-2);
  return { top, similar, fresh, explore };
}
const CATS_RU_W = { top: 'верха', bottom: 'низа', shoes: 'обуви', acc: 'аксессуаров' };
function wardrobeInsights(items) {
  const list = items || [];
  const colorCount = {}, styleCount = {}, catCount = { top: 0, bottom: 0, shoes: 0, acc: 0 };
  list.forEach((w) => {
    (w.colors || []).forEach((c) => { colorCount[c] = (colorCount[c] || 0) + 1; });
    (w.styles || []).forEach((s) => { styleCount[s] = (styleCount[s] || 0) + 1; });
    if (catCount[w.cat] !== undefined) catCount[w.cat]++;
  });
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const colors = top(colorCount, 3), styles = top(styleCount, 3);
  const gaps = Object.keys(catCount).filter((c) => !catCount[c]);
  let note;
  if (!list.length) note = 'Гардероб пока пуст. Добавь пару любимых вещей — и подборки станут точнее.';
  else {
    const parts = [];
    if (colors.length) parts.push('твои цвета — ' + colors.map((c) => (COLOR_RU[c] || c).toLowerCase()).join(', '));
    if (styles.length) parts.push('ближе всего ' + styles.map((s) => STYLE_RU[s] || s).join(' и '));
    if (gaps.length) parts.push('не хватает: ' + gaps.map((g) => CATS_RU_W[g]).join(', ') + ' — предложим это в первую очередь');
    note = 'Вижу ' + list.length + ' ' + plural(list.length, 'вещь', 'вещи', 'вещей') + ': ' + parts.join('; ') + '.';
  }
  return { count: list.length, colors, styles, gaps, catCount, note };
}
function plural(n, a, b, c) { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return b; return c; }
function nlParse(q) {
  const s = (q || '').toLowerCase();
  const res = { category: '', subcategory: '', color: '', maxPrice: null, style: '', occasion: '', size: '' };
  [['чёрн', 'black'], ['черн', 'black'], ['бел', 'white'], ['олив', 'olive'], ['беж', 'beige'], ['сер', 'gray'], ['зелён', 'green'], ['зелен', 'green'], ['син', 'blue'], ['голуб', 'blue'], ['коричн', 'brown']]
    .forEach(([k, v]) => { if (s.includes(k)) res.color = v; });
  [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['рюкзак', 'acc'], ['сумк', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc'], ['шапк', 'acc'], ['бини', 'acc'], ['панам', 'acc'], ['шарф', 'acc'], ['платок', 'acc'], ['перчат', 'acc'], ['варежк', 'acc'], ['носк', 'acc'], ['ремен', 'acc'], ['галстук', 'acc'], ['кошел', 'acc']]
    .forEach(([k, v]) => { if (s.includes(k)) res.category = v; });
  const SUBS = [['tshirt', ['футболк']], ['shirt', ['рубаш', 'блуз']], ['hoodie', ['худи', 'толстов', 'свитшот']], ['jacket', ['куртк', 'ветровк', 'пуховик', 'бомбер', 'жилет', 'пальто', 'плащ', 'парк', 'дубленк']], ['dress', ['плать', 'сарафан']], ['sweater', ['свитер', 'джемпер', 'кардиган', 'водолазк', 'пуловер']], ['polo', ['поло']], ['tank', ['майк', 'топик']], ['suit', ['костюм']], ['pajama', ['пижам']], ['robe', ['халат']], ['swim', ['купальник']], ['pants', ['брюк', 'чинос', 'карго', 'слакс']], ['jeans', ['джинс']], ['shorts', ['шорт', 'бридж']], ['skirt', ['юбк']], ['leggings', ['леггинс']], ['overalls', ['комбинезон']], ['sneakers', ['кроссов', 'кед', 'сникерс', 'слипон']], ['boots', ['ботин', 'челси', 'угг', 'сапог']], ['dress_shoes', ['туфл', 'лофер', 'мокасин', 'балетк']], ['sandals', ['сандал', 'босоножк', 'шлепанц', 'сланц']], ['bag', ['сумк', 'рюкзак', 'клатч', 'шоппер']], ['watch', ['часы']], ['cap', ['кепк', 'бейсболк', 'панам']], ['glasses', ['очк', 'очки']], ['hat', ['шапк', 'бини']], ['scarf', ['шарф', 'платок', 'снуд']], ['gloves', ['перчат', 'варежк']], ['belt', ['ремен', 'ремень']], ['wallet', ['кошел']], ['socks', ['носк', 'носки', 'гольф', 'колгот']], ['jewelry', ['браслет', 'серьг', 'кольц', 'цепочк', 'кулон', 'брошь']]];
  for (const [sub, keys] of SUBS) { for (const k of keys) { if (s.includes(k)) { res.subcategory = sub; break; } } if (res.subcategory) break; }
  const m = s.replace(/\s/g, '').match(/до(\d+)/) || s.match(/(\d+)\s*(₽|руб|р\b|тыс)/);
  if (m) { let v = parseInt(m[1], 10); if (s.includes('тыс')) v *= 1000; res.maxPrice = v; }
  if (s.includes('old money') || s.includes('олд')) res.style = 'oldmoney';
  else if (s.includes('минимал')) res.style = 'minimal';
  else if (s.includes('street') || s.includes('стрит')) res.style = 'street';
  else if (s.includes('спорт')) res.style = 'sport';
  else if (s.includes('smart') || s.includes('смарт')) res.style = 'smart';
  else if (s.includes('бизнес')) res.style = 'business';
  if (s.includes('осен')) res.occasion = 'autumn';
  if (s.includes('свидан') || s.includes('день рождения')) res.occasion = 'date';
  if (s.includes('школ')) res.occasion = 'school';
  if (/офис|работ/.test(s)) res.occasion = 'office';
  if (/выходн/.test(s)) res.occasion = 'weekend';
  if (/прогулк/.test(s)) res.occasion = 'walk';
  const sm = s.match(/размер(?:а|у)?\s*([a-z0-9]+)/) || s.match(/\b(xs|s|m|l|xl|xxl|3[0-9]|4[0-5])\b/);
  if (sm) res.size = sm[1].toUpperCase();
  return res;
}
/* Реальные объяснения; значения null = «нет данных». */
function explain(p, profile, analysis, extra) {
  profile = profile || {};
  const r = p.aiParts || {};
  const need = p.cat === 'shoes' ? profile.shoeSize : p.cat === 'bottom' ? profile.pantsSize : profile.topSize;
  const sizeOk = (p.sizes || []).includes(String(need)) || (p.sizes || []).includes('One');
  const an = analysis || null;
  const qualityNote = an
    ? `Оценка основана на составе (${an.material}) и повторяющихся сигналах из отзывов.`
    : (p.reviews ? 'Данных мало — используем рейтинг карточки.' : 'Недостаточно данных для оценки качества.');
  const matchedStyles = (p.styles || []).filter((s) => (profile.styles || []).includes(s)).map((s) => STYLE_RU[s]);
  const compat = ((extra && extra.compatItems) || []).length;
  return {
    score: p.aiScore, conf: p.aiConf == null ? null : p.aiConf,
    factors: [
      { key: 'style', title: 'Стиль', value: r.style == null ? null : r.style, text: r.style == null ? 'Стиль вещи не указан — не оцениваем.' : (matchedStyles.length ? 'Совпадает с твоими стилями: ' + matchedStyles.join(', ') + '.' : 'Не совпадает с выбранными тобой стилями.') },
      { key: 'body', title: 'Посадка', value: r.body == null ? null : r.body, text: r.body == null ? 'Крой в карточке не указан — посадку не оцениваем.' : `Крой «${FIT_RU[p.fit] || p.fit}» и твоё телосложение — оценка предположительная.` },
      { key: 'budget', title: 'Цена', value: r.budget == null ? null : r.budget, text: p.price <= profile.budget ? 'Укладывается в бюджет.' : 'Выше бюджета.' },
      { key: 'quality', title: 'Качество', value: r.quality == null ? null : r.quality, text: qualityNote },
      { key: 'size', title: 'Размер', value: r.size == null ? null : r.size, text: !need ? 'Размер в профиле не указан.' : (sizeOk ? `Размер ${need} есть.` : `Размера ${need} нет — оценка снижена.`) },
      { key: 'wardrobe', title: 'Гардероб', value: r.wardrobe == null ? null : r.wardrobe, text: r.wardrobe == null ? 'Гардероб пуст — не сравниваем.' : (compat ? 'Сочетается с вещами, которые у тебя уже есть.' : 'Нейтрально к текущему гардеробу.') }
    ],
    reviewSummary: an ? an.review_summary : null,
    redundancy: ((extra && extra.redund) || 0) > 0.6 ? 'У тебя уже есть несколько похожих моделей — эта оценена строже.' : null
  };
}
module.exports = { STYLE_RU, COLOR_RU, scoreProduct, rankProducts, buildOutfits, scoreOutfit, colorCompat, feedMix, nlParse, explain, reasonsFor, enrichItem, currentSeason, fitScore, wardrobeInsights, redundancy, tempSeasons, OCCASION_STYLES };
