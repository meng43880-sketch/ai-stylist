'use strict';
/* stylist.js — AI-стилист v2 (подключается одной строкой require в server.js).
   Конвейер:  А «понять» (малая модель, JSON)  →  код ищет и считает  →  Б «сказать» (текст по реальным данным)
   Модель не выдумывает вещи: каждый id и каждая причина проверяются кодом.
   При любой проблеме с v2 — тихий откат на старый O.chat (origChat), приложение не падает.
   Фото-запросы и режим без AI-ключа тоже идут по старому пути. */
const { CFG } = require('./config');
const Q = require('./qwen');
const R = require('./recommend');
const T = require('./taste');
const CX = require('./context');
const EV = require('./events');
const store = require('./store');
const O = require('./orchestrator');
const P = require('./persona');

const origChat = O.chat;

async function callJSON(provider, system, user, opts) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text: user }] }];
  const msg = await Q.chatComplete(provider, { messages, tag: opts.tag, maxTokens: opts.maxTokens, temperature: opts.temperature });
  return P.extractJSON(msg.content || '');
}
const lc = (arr, map) => arr.map((k) => String(map[k] || k).toLowerCase());
/* Человеческая фраза о вкусе вместо «style: casual (62%)». */
function tasteLine(taste, profile) {
  const likeSt = T.topOf(taste, 'style', 2, 0.4).map((x) => x.key).filter((k) => R.STYLE_RU[k]);
  const likeCo = T.topOf(taste, 'colors', 2, 0.4).map((x) => x.key).filter((k) => R.COLOR_RU[k]);
  const negSt = T.negatives(taste, 'style').filter((k) => R.STYLE_RU[k]);
  const negCo = T.negatives(taste, 'colors').filter((k) => R.COLOR_RU[k]);
  const bits = [];
  const likes = lc(likeSt, R.STYLE_RU).concat(lc(likeCo, R.COLOR_RU));
  if (likes.length) bits.push('Любит: ' + likes.join(', '));
  else if (profile && (profile.styles || []).length) bits.push('Заявленные стили: ' + lc(profile.styles, R.STYLE_RU).join(', '));
  const dis = lc(negSt, R.STYLE_RU).concat(lc(negCo, R.COLOR_RU));
  if (dis.length) bits.push('Не любит: ' + dis.join(', '));
  return bits.join('. ');
}
/* Склеиваем намерение: AI поверх базы, но пустые значения базу не затирают. */
function mergeIntent(base, und) {
  const b = base || { hard: {}, soft: {}, queries: {} };
  const hard = Object.assign({}, b.hard);
  Object.keys(und.hard).forEach((k) => { const v = und.hard[k]; if (v !== '' && v != null) hard[k] = v; });
  const soft = Object.assign({}, b.soft);
  ['colors', 'styles', 'avoid'].forEach((k) => { if (und.soft[k].length) soft[k] = und.soft[k]; });
  if (und.soft.occasion) soft.occasion = und.soft.occasion;
  return { hard, soft, queries: b.queries || {}, message: b.message || '', relaxed: [], allowBudgetRelax: und.allowBudgetRelax };
}
/* «Подешевле», «другое» — опираемся на слоты диалога. */
function applyRefine(intent, msg, slots, profile) {
  const s = String(msg || '').toLowerCase();
  const refine = /дешевле|подешевле|другое|другой|другие|ещё вариант|еще вариант|такие же|а такие/.test(s);
  if (refine && !intent.hard.category && !intent.hard.subcategory) {
    if (slots.category) intent.hard.category = slots.category;
    if (slots.subcategory) intent.hard.subcategory = slots.subcategory;
  }
  if (/дешевле|подешевле/.test(s)) {
    const base = slots.medianPrice || slots.maxPrice || Number(profile.budget) || 5000;
    intent.hard.maxPrice = Math.max(500, Math.round(base * 0.75));
  }
  if (!intent.soft.occasion && slots.occasion) intent.soft.occasion = slots.occasion;
  return { refine };
}
const median = (a) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
/* Голое приветствие — всегда болтовня, а не поиск. Иначе «привет» на фоне
   истории покупок уходит у маленькой модели в find_item и отвечает
   шаблоном «ничего не нашёл». С предметной частью («привет, подбери…») не срабатывает. */
function greetingOnly(msg) {
  const s = String(msg || '').trim().toLowerCase().replace(/[!.…?]+$/g, '').replace(/ё/g, 'е');
  return /^(привет(ик)?|здравствуй(те)?|добрый день|доброе утро|добрый вечер|салют|hello|hi|йо|ку)$/.test(s);
}

async function chatV2(args, msg) {
  const { conversationId, profile, feedback, uid, wardrobe } = args;
  const t0 = Date.now();
  const cid = conversationId || ('c' + Date.now());
  const UU = store.UD(uid); EV.ensureUser(UU);
  const chats = UU.chats || {}; const prev = chats[cid] || [];
  const wr = wardrobe || UU.wardrobe || [];
  const weather = await O.getWeather();
  const temp = weather && typeof weather.temp === 'number' ? weather.temp : null;
  const slots = (UU.session && UU.session[cid]) || {};
  const baseIntent = CX.baseIntent(msg, UU);
  const hist = prev.slice(-10).map((m) => ({ who: m.role === 'ai' ? 'stylist' : 'user', text: String(m.text || '').slice(0, 200) }));
  const brief = { gender: profile.gender, height: profile.height, build: profile.build, budget: profile.budget, sizes: [profile.topSize, profile.pantsSize, profile.shoeSize].join('/'), styles: profile.styles, colors: profile.colors };

  /* А. Понять запрос */
  let und;
  try {
    const raw = await callJSON(CFG.qwen.stylist, P.UNDERSTAND_SYSTEM,
      JSON.stringify({ message: msg, profile: brief, slots, history: hist.slice(-6), taste: tasteLine(UU.taste, profile) }),
      { tag: 'stylist', maxTokens: 260, temperature: 0.1 });
    und = P.normUnderstand(raw);
  } catch (e) {
    if (e.code === 'AUTH' || e.code === 'NO_FUNDS') throw e;
    und = P.normUnderstand({});
  }
  const intent = mergeIntent(baseIntent, und);
  const { refine } = applyRefine(intent, msg, slots, profile);
  if (greetingOnly(msg)) und.intent = 'chitchat';
  const crit = O.structFromIntent(intent, R.nlParse(msg));
  const text = und.suggestQuery || (refine && slots.lastQuery) || (intent.queries && intent.queries.normal) || msg;

  /* Поиск и расчёт — только код */
  let items = [], total = 0, relaxed = [];
  if (und.intent !== 'chitchat') {
    const pipe = await O.searchPipeline({ struct: crit, text, profile, feedback, limit: 50, wardrobe: wr, intent, taste: UU.taste, favorites: UU.favorites });
    items = pipe.items; total = pipe.total; relaxed = pipe.relaxed || [];
    items.slice(0, 12).forEach((p) => { const rs = R.reasonsFor(p, profile, { temp, wardrobe: wr }); p.why = rs.why; p.warn = rs.warn; });
  }

  /* Б. Сказать — по реальным найденным вещам */
  let say = null;
  const allowed = items.slice(0, 5).map((p) => p.id);
  if (items.length || und.intent === 'chitchat' || und.intent === 'advice') {
    const payload = JSON.stringify({
      request: msg, understood: { category: crit.category, maxPrice: crit.maxPrice, occasion: crit.occasion, colors: intent.soft.colors },
      weatherTemp: temp, profile: brief, taste: tasteLine(UU.taste, profile), history: hist.slice(-4), missing: und.missing,
      wardrobe: wr.slice(0, 6).map((w) => w.title),
      items: items.slice(0, 5).map((p) => ({ id: p.id, title: String(p.title).slice(0, 60), price: p.price, why: p.why || [], warn: p.warn || [] }))
    });
    for (let i = 0; i < 2 && !say; i++) {
      try {
        const raw = await callJSON(CFG.qwen.stylist, P.SAY_SYSTEM, payload, { tag: 'stylist', maxTokens: 300, temperature: i ? 0.2 : 0.5 });
        say = P.validateSay(raw, allowed);
      } catch (e) {
        if (e.code === 'AUTH' || e.code === 'NO_FUNDS') throw e;
      }
    }
  }
  if (!say && und.intent === 'chitchat') say = { message: 'Привет! Я помогу подобрать вещи под твой вкус и бюджет — просто напиши, что ищем. Например: «куртка на осень».', picks: [], question: null, quick: [] };
  if (!say) say = P.templateSay({ category: crit.category, maxPrice: crit.maxPrice }, items, temp);
  /* Reason у вещи — из модели, а если она пустая, из «why» кода. */
  say.picks.forEach((pk) => {
    const it = items.find((x) => x.id === pk.id);
    if (it && !pk.reason) pk.reason = (it.why && it.why[0]) || '';
  });
  if (relaxed.length) {
    const notes = { color2: 'убрал второй цвет', color: 'расширил цвета', fit: 'расширил посадку', style: 'расширил стиль', budget: 'чуть приподнял бюджет' };
    const n = relaxed.map((k) => notes[k]).filter(Boolean).join(', ');
    if (n) say.message += ' (' + n + ')';
  }

  /* Побочные эффекты — только после успеха, чтобы откат на origChat не дублировал сообщения */
  for (const l of und.learned) { try { await EV.logEvent(UU, 'explicit', null, { dim: l.dim, key: l.key, like: l.like, why: 'chat' }); } catch (e) { /* не критично */ } }
  await EV.logEvent(UU, 'search', null, { query: msg, intent: (intent.message || '') });
  EV.logRec(UU, msg, items.map((x) => x.id));
  const hp = R.nlParse(msg).maxPrice;
  UU.session = UU.session || {};
  UU.session[cid] = Object.assign({}, slots, {
    occasion: intent.soft.occasion || slots.occasion || '', category: crit.category || slots.category || '',
    subcategory: crit.subcategory || slots.subcategory || '', maxPrice: hp || und.hard.maxPrice || slots.maxPrice || null,
    medianPrice: median(items.slice(0, 8).map((p) => p.price)) || slots.medianPrice || 0, lastQuery: text
  });
  chats[cid] = prev.concat([{ role: 'user', text: msg, t: Date.now() }, { role: 'ai', text: say.message, t: Date.now() }]).slice(-30);
  UU.chats = chats;
  store.logHistory('ai', `stylist2 ${Q.getLastModel('stylist') || CFG.qwen.stylist.model} ${Date.now() - t0}ms ${und.intent}`);
  store.save();
  return {
    intent: und.intent, searchCriteria: crit, searchIntent: intent, relaxed,
    message: say.message, picks: say.picks, question: say.question, quick: say.quick,
    suggestQuery: text, products: items, total, conversationId: cid, aiMode: 'production', model: CFG.qwen.stylist.model
  };
}
async function chat(args) {
  const message = String(args.message || '').slice(0, 500);
  if (args.image || !args.uid || !Q.isConfigured(CFG.qwen.stylist)) return origChat(args);
  if (!message.trim()) throw Q.err('BAD_REQUEST', 'Пустое сообщение', 400);
  try { return await chatV2(args, message); }
  catch (e) {
    console.error('stylist v2 failed, fallback:', e.code || '', e.message);
    if (e.code === 'BAD_REQUEST') throw e;
    return origChat(args);
  }
}

/* ---------- Образы: свои вещи из гардероба + честные причины ---------- */
function addOwn(items, U) {
  const have = new Set(items.map((x) => x.id));
  ((U && U.wardrobe) || []).forEach((w) => {
    if (!['top', 'bottom', 'shoes', 'acc'].includes(w.cat)) return;
    const id = 'own' + w.id;
    if (have.has(id)) return;
    items.push({
      id, own: true, ownTitle: w.title, title: w.title + ' (у тебя есть)', price: 0, old: 0, img: w.photo || '', mp: '',
      cat: w.cat, colors: w.colors || [], styles: w.styles || [], sizes: ['One'], fit: 'regular', fitKnown: false,
      rating: 0, reviews: 0, aiScore: 78, seasons: null
    });
  });
  return items;
}
function outfitsFor(items, profile, U, count) {
  const w = store.getCache('weather', 'cur', 3600 * 1000);
  const temp = w && typeof w.temp === 'number' ? w.temp : null;
  const budget = (Number(profile.budget) || 5000) * 2.5; // бюджет в профиле — за вещь; на образ берём ×2.5
  return R.buildOutfits(items, profile, count || 3, { wardrobe: (U && U.wardrobe) || [], temp, budget });
}

/* Подключаем: server.js зовёт O.chat / O.reviewComment в момент запроса, поэтому подмена работает. */
O.chat = chat;
O.reviewComment = require('./reviews').reviewComment;
module.exports = { chat, addOwn, outfitsFor, tasteLine, mergeIntent, applyRefine, greetingOnly };
