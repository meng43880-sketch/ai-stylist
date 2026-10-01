'use strict';
/* orchestrator.js — AIOrchestrator: решает КАКОЙ AI вызывать, а что считать кодом.
   Правило: фильтры/цены/размеры/сортировка/дедуп/score — код. AI — только
   понимание фото, языка, отзывов и сложных стилистических решений. */
const crypto = require('crypto');
const { CFG } = require('./config');
const { db, save, getCache, setCache, logHistory } = require('./store');
const Q = require('./qwen');
const C = require('./catalog');
const R = require('./recommend');
const M = require('./market');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

/* ---------- VISION ---------- */
/* System prompts — на английском: в ~2 раза меньше токенов, чем кириллица.
   Ответы пользователю всё равно по-русски (требуем в промпте). */
const VISION_SYSTEM = `You are a Vision AI for a personal stylist. Analyze the user photo.
Return STRICT JSON: {appearance:{hair_color,eye_color,skin_tone,face_shape}, visual_proportions:{shoulder_width,body_build,silhouette,height_impression}, style_signals:[max 3 short phrases in Russian], recommended_colors:[], avoid_colors:[], recommended_fits:[], avoid_fits:[], recommended_styles:[], confidence:{appearance,proportions,style,colors}}.
Forbidden: medical inferences, health, exact clothing size, categorical claims. Colors from [black,white,olive,beige,gray,green,blue,brown]. Styles from [casual,smart,street,minimal,sport,oldmoney,business,classic,tech,oversize,party].`;
function demoVision(profile) {
  const styles = (profile.styles && profile.styles.length ? profile.styles : ['casual', 'minimal']).slice();
  const base = {};
  styles.forEach((s, i) => { base[s] = 94 - i * 7; });
  ['casual', 'minimal', 'smart', 'street', 'classic'].forEach((s) => { if (!(s in base)) base[s] = 62 + ((s.length * 7) % 14); });
  const styleScores = Object.entries(base).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const colors = (profile.colors && profile.colors.length ? profile.colors : ['black', 'white', 'olive', 'beige', 'gray']).slice(0, 5);
  const fits = profile.build === 'plus' ? ['relaxed', 'straight'] : profile.build === 'slim' ? ['regular', 'slim'] : ['regular', 'straight', 'relaxed'];
  return {
    source: 'demo', styleScores, colors, fits, avoid: ['very skinny', 'экстремально укороченные вещи'],
    summary: 'AI считает, что тебе хорошо подходят спокойные базовые цвета и структурированные силуэты. Они визуально подчёркивают пропорции и позволяют легко собирать образы.',
    confidence: { appearance: 0.6, proportions: 0.55, style: 0.7, colors: 0.65 }
  };
}
async function analyzePhoto({ image, profile }) {
  if (!image || typeof image !== 'string' || image.length > CFG.limits.imageBytes + 1000)
    throw Q.err('BAD_IMAGE', 'Нужно фото до ~4 МБ', 400);
  const key = sha(image.slice(0, 50000) + JSON.stringify(profile.styles || []));
  const hit = getCache('vision', key, 30 * 24 * 3600 * 1000);
  if (hit) return Object.assign({ cached: true }, hit);
  if (!Q.isConfigured(CFG.qwen.vision)) {
    const d = demoVision(profile);
    setCache('vision', key, d);
    return Object.assign({ cached: false }, d);
  }
  const obj = await Q.chatJSON(CFG.qwen.vision, {
    system: VISION_SYSTEM,
    user: 'Analyze the photo. Profile: height ' + profile.height + 'cm, weight ' + profile.weight + 'kg, build ' + profile.build + '. JSON only.',
    images: [image],
    required: [],
    tag: 'vision', maxTokens: 600
  });
  const norm = normalizeVision(obj);
  const out = Object.assign({ source: 'qwen-vision', model: CFG.qwen.vision.model }, norm);
  setCache('vision', key, out);
  logHistory('ai', 'Vision-профиль создан (Qwen)');
  return Object.assign({ cached: false }, out);
}

/* ---------- PRODUCT AI ---------- */
async function productAnalysis(productId) {
  const p = C.DemoProductProvider.getById(productId);
  if (!p) throw Q.err('NOT_FOUND', 'Товар не найден', 404);
  const hit = getCache('analyses', productId, 7 * 24 * 3600 * 1000);
  if (hit) return Object.assign({ cached: true }, hit);
  if (!Q.isConfigured(CFG.qwen.product)) {
    const d = C.demoAnalysis(p);
    setCache('analyses', productId, d);
    return Object.assign({ cached: false }, d);
  }
  const rev = C.getReviews(productId);
  try {
    const obj = await Q.chatJSON(CFG.qwen.product, {
      system: 'You are a Product AI structuring fashion item data. Return STRICT JSON: {category,subcategory,color,fit,style[],season[],quality_signals:{material,construction,reviews},value_for_money,review_summary:{positive[],negative[]}}. Positive/negative phrases in Russian, max 4 words each. Never invent missing facts: no data means "not enough data".',
      user: `Title: ${p.title}\nBrand: ${p.brand}\nDesc: ${p.desc}\nFabric: ${p.material}\nPrice: ${p.price} RUB (was ${p.old})\nRating: ${p.rating}, reviews: ${p.reviews}\nReviews: ${(rev.reviews || []).map((r) => r.author + ': ' + r.text).join(' | ')}`,
      required: [],
      tag: 'product', maxTokens: 500
    });
    const norm = normalizeProduct(obj, p);
    const out = Object.assign({ productId, source: 'qwen-product' }, norm);
    setCache('analyses', productId, out);
    return Object.assign({ cached: false }, out);
  } catch (e) {
    if (e.code === 'BAD_REQUEST' || e.code === 'NOT_FOUND') throw e;
    const q = p.rating ? Math.round((p.rating / 5) * 100) : 60;
    return { productId, source: 'signals', cached: false, confidence: 0.42, note: 'AI временно недоступен — показан рейтинг карточки.' };
  }
}

/* ---------- Tolerant normalizers: маленькие модели часто отдают JSON
   не той формы ({"response": ...} вместо {"message": ...}). Приводим к нашей
   схеме вместо того, чтобы падать. ---------- */
function pickStr(o, keys) {
  for (const k of keys) if (typeof o[k] === 'string' && o[k].trim()) return o[k].trim();
  return '';
}
function normalizeStylist(o) {
  o = (o && typeof o === 'object') ? o : {};
  return {
    intent: typeof o.intent === 'string' && o.intent ? o.intent : 'find_products',
    message: pickStr(o, ['message', 'response', 'text', 'answer', 'reply']),
    searchCriteria: (o.searchCriteria && typeof o.searchCriteria === 'object') ? o.searchCriteria : {}
  };
}
function normalizeProduct(o, item) {
  o = (o && typeof o === 'object') ? o : {};
  const qs = o.quality_signals || o.quality || {};
  const num = (v, d) => Number.isFinite(+v) ? +v : d;
  return {
    category: o.category || o.cat || item.cat,
    subcategory: o.subcategory || '',
    color: o.color || ((item.colors || [])[0] || ''),
    fit: o.fit || item.fit || 'regular',
    style: Array.isArray(o.style) ? o.style : (Array.isArray(o.styles) ? o.styles : (item.styles || [])),
    season: Array.isArray(o.season) ? o.season : (Array.isArray(o.seasons) ? o.seasons : ['spring', 'autumn']),
    quality_signals: { material: num(qs.material, 70), construction: num(qs.construction, 70), reviews: num(qs.reviews, 70) },
    value_for_money: num(o.value_for_money != null ? o.value_for_money : o.value, 70),
    review_summary: { positive: ((o.review_summary || {}).positive || o.positive || []).slice(0, 3), negative: ((o.review_summary || {}).negative || o.negative || []).slice(0, 2) },
    confidence: num(o.confidence, 0.5)
  };
}
function normalizeVision(o) {
  o = (o && typeof o === 'object') ? o : {};
  const arr = (v) => Array.isArray(v) ? v : [];
  return {
    appearance: o.appearance || {},
    visual_proportions: o.visual_proportions || o.proportions || {},
    style_signals: arr(o.style_signals || o.signals).slice(0, 3),
    recommended_colors: arr(o.recommended_colors || o.colors),
    avoid_colors: arr(o.avoid_colors),
    recommended_fits: arr(o.recommended_fits || o.fits),
    avoid_fits: arr(o.avoid_fits),
    recommended_styles: arr(o.recommended_styles || o.styles),
    confidence: o.confidence || {}
  };
}
/* ---------- PRODUCT AI over newcomers ---------- */
const MAX_NEW_ANALYZE = 8;
async function analyzeLiveItem(item) {
  const hit = getCache('analyses', item.id, 7 * 24 * 3600 * 1000);
  if (hit) return hit;
  if (!Q.isConfigured(CFG.qwen.product)) {
    // Без ключа — честные сигналы из рейтинга, не «анализ AI».
    const q = item.rating ? Math.round((item.rating / 5) * 100) : 60;
    const d = {
      productId: item.id, source: 'signals', confidence: 0.42,
      category: item.cat, colors: item.colors, fit: item.fit || 'regular', styles: item.styles || [], seasons: ['spring', 'autumn'],
      material: 'нет данных', quality_signals: { material: q - 5, construction: q - 8, reviews: q },
      value_for_money: q, review_summary: { positive: [], negative: [] },
      note: 'Недостаточно данных для уверенной оценки — показан рейтинг карточки.'
    };
    setCache('analyses', item.id, d);
    return d;
  }
  const obj = await Q.chatJSON(CFG.qwen.product, {
    system: 'You are a Product AI. Return STRICT JSON: {category,subcategory,color,fit,style[],season[],quality_signals:{material,construction,reviews},value_for_money,review_summary:{positive[],negative[]},confidence}. No inventing: no data means confidence below 0.5 and empty lists.',
    user: `Title: ${item.title}\nBrand: ${item.brand || ''}\nPrice: ${item.price} RUB\nRating: ${item.rating || 'none'}, ratings: ${item.reviews || 0}\nColors: ${(item.colors || []).join(',')}\nSizes: ${(item.sizes || []).join(',')}`,
    required: [],
    tag: 'product', maxTokens: 500
  });
  const out = Object.assign({ productId: item.id, source: 'qwen-product' }, normalizeProduct(obj, item));
  setCache('analyses', item.id, out);
  return out;
}
/* Новинки топа без кеша → AI#3 (макс. 8 за поиск, остальным — кеш/сигналы). */
async function ensureLiveAnalyses(items) {
  const fresh = (items || []).filter((p) => p.live && !getCache('analyses', p.id, 7 * 24 * 3600 * 1000)).slice(0, MAX_NEW_ANALYZE);
  const out = {};
  for (const p of fresh) {
    try { out[p.id] = await analyzeLiveItem(p); } catch (e) { /* пропускаем, не роняем поиск */ }
  }
  return out;
}
function activeCatalog(struct) {
  if (CFG.dataSource === 'production') {
    // Production: здесь выбирается реальный провайдер (WB/Ozon) через backend-proxy.
    // Без подключённого источника честно сообщаем, а не выдумываем товары.
    throw Q.err('NO_SOURCE', 'Production-источник не подключён. Переключи DATA_SOURCE=demo.', 503);
  }
  return C.DemoProductProvider.search(struct || {});
}
function scoreCtx(profile, feedback, extra) {
  return Object.assign({
    profile, feedback: feedback || { likes: {}, dislikes: {}, styleW: {}, colorW: {} },
    season: R.currentSeason(), occasion: '', analyses: {}, wardrobe: []
  }, extra || {});
}
/* ---------- SEARCH PIPELINE (cost control) ----------
   Воронка: веер запросов × страницы (до ~180 кандидатов) → код-фильтры →
   скоринг → топ-30 → AI#3 только по новичкам без кеша (макс. 8) → топ-20.
   AI никогда не видит сотни товаров. */
async function searchPipeline({ struct, text, profile, feedback, limit, wardrobe }) {
  // Демо-каталог выключен по умолчанию: только живьё + пустота, без выдумок.
  let list = CFG.demoCatalog ? activeCatalog(struct) : [];
  let total = list.length;
  list = list.slice(0, 500);
  const top = R.rankProducts(list, scoreCtx(profile, feedback, { occasion: struct && struct.occasion, wardrobe: wardrobe || [] }));
  let cands = top.slice(0, limit || 20);
  // Обогащаем топ кешированными демо-анализами (без AI-вызовов в демо-режиме)
  const analyses = {};
  cands.forEach((p) => { const d = C.DemoProductProvider.getById(p.id); if (d) analyses[p.id] = C.demoAnalysis(d); });
  // Открытые датасеты: реальные товары WB, работают без сети маркетплейсов.
  try {
    const D = require('./datasets');
    const rows = await D.ensureLoaded();
    if (rows.length) {
      const ds = D.searchRows(rows, {
        query: text || '', category: struct.category || '', subcategory: struct.subcategory || '',
        maxPrice: struct.maxPrice || null,
        colors: struct.color ? [struct.color] : [],
        limit: 60
      });
      const dsCtx = scoreCtx(profile, feedback, { occasion: struct && struct.occasion, wardrobe: wardrobe || [] });
      const dsRanked = R.rankProducts(ds.items, dsCtx);
      const seen = new Set(cands.map((x) => x.id));
      dsRanked.forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); cands.push(p); } });
      cands.sort((a, b) => b.aiScore - a.aiScore);
      cands = cands.slice(0, limit || 20);
      total += ds.total;
    }
  } catch (e) { /* датасет недоступен — идём дальше без него */ }
  let source = CFG.dataSource;
  // hybrid: воронка живья WB (веер × 1 страница, до ~50) → топ-50.
  if (CFG.dataSource === 'hybrid') {
    try {
      const queries = (text && text.trim()) ? [text.trim()] : M.structToQueries(struct || {});
      const live = await M.funnelSearch(queries, 5, 1);
      if (live.length) {
        const ctx = scoreCtx(profile, feedback, { occasion: struct && struct.occasion, wardrobe: wardrobe || [] });
        const scored = M.scoreLive(live.slice(0, 1), ctx).slice(0, 1);
        const fresh = await ensureLiveAnalyses(scored);
        Object.assign(analyses, fresh);
        const ids = new Set(scored.map((x) => x.id));
        cands = scored.concat(cands.filter((x) => !ids.has(x.id))).slice(0, limit || 50);
        source = 'hybrid';
      }
    } catch (e) { /* тихий fallback на демо; frontend покажет пометку */ }
  }
  return { total, items: cands, analyses, source };
}

/* ---------- STYLIST CHAT ---------- */
const STYLIST_TOOLS = [
  { type: 'function', function: { name: 'search_products', description: 'Найти товары по структуре', parameters: { type: 'object', properties: { category: { type: 'string' }, color: { type: 'string' }, maxPrice: { type: 'number' }, style: { type: 'string' } } } } },
  { type: 'function', function: { name: 'build_outfit', description: 'Собрать готовый образ', parameters: { type: 'object', properties: { maxTotal: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_weather', description: 'Текущая погода', parameters: { type: 'object', properties: {} } } }
];
async function getWeather() {
  const hit = getCache('weather', 'cur', 30 * 60 * 1000);
  if (hit) return hit;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${CFG.weather.lat}&longitude=${CFG.weather.lon}&current=temperature_2m,precipitation,weathercode&timezone=auto`);
    const j = await r.json();
    const out = { city: CFG.weather.city, temp: Math.round(j.current.temperature_2m), precipitation: j.current.precipitation, code: j.current.weathercode, source: 'open-meteo' };
    setCache('weather', 'cur', out);
    return out;
  } catch { return { city: CFG.weather.city, temp: null, source: 'unavailable' }; }
}
/* ---------- VISION для вещи с фото: описываем → ищем похожие ---------- */
function shaShort(s) { return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32); }
async function describeItem(image) {
  const key = shaShort(String(image).slice(0, 50000));
  const hit = getCache('vision_items', key, 30 * 24 * 3600 * 1000);
  if (hit) return Object.assign({ cached: true }, hit);
  if (!Q.isConfigured(CFG.qwen.vision)) {
    const e = new Error('Анализ фото недоступен: подключи vision-модель.');
    e.code = 'NO_VISION'; e.status = 503; throw e;
  }
  const obj = await Q.chatJSON(CFG.qwen.vision, {
    system: 'You see ONE clothing item. Return STRICT JSON: {category: top|bottom|shoes|acc, colors: [up to 2 from black,white,olive,beige,gray,green,blue,brown], styles: [up to 2 from casual,smart,street,minimal,sport,oldmoney,business,classic,tech,oversize,party], query: "short Russian marketplace search phrase, 2-4 words", summary: "1 Russian sentence describing the item"}. Only JSON.',
    user: 'What item is in the photo? JSON only.',
    images: [image],
    required: [], tag: 'vision', maxTokens: 300
  });
  const colors = Array.isArray(obj.colors) ? obj.colors.filter((c) => R.COLOR_RU[c]).slice(0, 2) : [];
  const styles = Array.isArray(obj.styles) ? obj.styles.filter((s) => R.STYLE_RU[s]).slice(0, 2) : [];
  const cats = ['top', 'bottom', 'shoes', 'acc'];
  const out = {
    source: 'qwen-vision', category: cats.includes(obj.category) ? obj.category : '',
    colors, styles, query: String(obj.query || '').slice(0, 60),
    summary: String(obj.summary || obj.description || '').slice(0, 200)
  };
  setCache('vision_items', key, out);
  return Object.assign({ cached: false }, out);
}
function demoBrain(message, profile, ctx) {
  const parsed = R.nlParse(message);
  const hasQ = parsed.category || parsed.color || parsed.maxPrice || parsed.style;
  const budget = parsed.maxPrice || profile.budget;
  const wr = (ctx.wardrobe && ctx.wardrobe.length) ? R.wardrobeInsights(ctx.wardrobe) : null;
  const wrTail = wr ? ' Учту твой гардероб (' + wr.count + '): ' + wr.note : '';
  let reply;
  if (/привет|здравствуй|добрый/i.test(message)) reply = `Привет, ${profile.name || 'друг'}! Скажи, что подобрать — например «образ на осень до 15000» или «чёрная куртка». Работаем в пределах твоего бюджета — до ${Number(profile.budget).toLocaleString('ru-RU')} ₽.`;
  else if (parsed.occasion === 'date') reply = `Для свидания соберу smart-вариант: рубашка, прямые брюки и чистая обувь. Подбираю в пределах ${Number(budget).toLocaleString('ru-RU')} ₽.`;
  else if (parsed.occasion === 'autumn' || /осень/i.test(message)) reply = `На осень возьмём второй слой: куртка или overshirt, лонгслив и джинсы. Учитываю погоду в ${ctx.weather.city}${ctx.weather.temp != null ? ` (сейчас ${ctx.weather.temp}°C)` : ''}.`;
  else if (/похож|такие же|ещё/i.test(message)) reply = 'Понял, ищу похожие: тот же стиль и палитра, но другие модели.';
  else if (/минимал/i.test(message)) reply = 'Ок, двигаемся в минимализм: спокойные цвета, чистые силуэты, ничего лишнего.';
  else if (hasQ) reply = `Понял запрос. Ищу: ${[parsed.category, parsed.color, parsed.maxPrice ? 'до ' + parsed.maxPrice : '', parsed.style].filter(Boolean).join(' · ') || 'персональную подборку'}.` + wrTail;
  else reply = `Подберу варианты в пределах твоего бюджета. Уточни, если нужно: категория, цвет или повод — например «брюки на выход».` + (wr ? ' Заодно сверюсь с твоим гардеробом.' : '');
  return { intent: hasQ || parsed.occasion ? 'find_products' : 'chat', searchCriteria: parsed, message: reply, source: 'demo' };
}
async function chat({ message, conversationId, profile, feedback, uid, wardrobe, image }) {
  const msg = String(message || '').slice(0, 500);
  if (!msg.trim() && !image) throw Q.err('BAD_REQUEST', 'Пустое сообщение', 400);
  const cid = conversationId || ('c' + Date.now());
  const store = require('./store');
  const chats = uid ? store.UD(uid).chats : {};
  const wr = wardrobe || (uid ? store.UD(uid).wardrobe : []) || [];
  chats[cid] = chats[cid] || [];
  chats[cid].push({ role: 'user', text: msg, t: Date.now() });  const weather = await getWeather();
  const ctx = { weather, season: R.currentSeason(), wardrobe: wr };
  let out;
  /* Фото вещи: вижен описывает → критерии → поиск похожих. */
  if (image) {
    if (typeof image !== 'string' || image.length > 1200000) throw Q.err('BAD_IMAGE', 'Фото слишком большое', 400);
    const seen = await describeItem(image);
    const crit = { category: seen.category, color: (seen.colors || [])[0] || '', style: (seen.styles || [])[0] || '', size: profile.topSize || '' };
    const pipe = await searchPipeline({ struct: crit, text: seen.query, profile, feedback, limit: 50, wardrobe: wr });
    let text = seen.summary ? `Вижу: ${seen.summary} Ищу похожие.` : 'Разобрал фото, ищу похожие вещи.';
    if (Q.isConfigured(CFG.qwen.stylist)) {
      try {
        const a = await Q.chatJSON(CFG.qwen.stylist, {
          system: 'You are an AI stylist. The user uploaded a photo of an item: ' + (seen.summary || seen.query) + '. Criteria: ' + JSON.stringify(crit) + '. Reply in Russian, max 2 short sentences: confirm what you see and that you are finding similar items.',
          user: msg || 'Найди похожие.',
          required: [], tag: 'stylist', maxTokens: 200
        });
        const n = normalizeStylist(a);
        if (n.message) text = n.message;
      } catch (e) { /* оставляем шаблонный ответ */ }
    }
    out = { intent: 'find_similar', searchCriteria: crit, suggestQuery: seen.query, message: text, products: pipe.items, total: pipe.total, conversationId: cid, aiMode: Q.isConfigured(CFG.qwen.stylist) ? 'production' : 'demo', seen };
  } else if (!Q.isConfigured(CFG.qwen.stylist)) {
    const d = demoBrain(msg, profile, ctx);
    const pipe = await searchPipeline({ struct: d.searchCriteria, profile, feedback, limit: 50, wardrobe: wr });
    out = Object.assign({}, d, { products: pipe.items, total: pipe.total, conversationId: cid, aiMode: 'demo' });
  } else {
    // Production: Main AI. При недоступности — тихий откат на demoBrain (§51).
    try {
      const wrSum = wr.map((w) => `${w.title} (${w.cat}, ${(w.colors || []).join('/')})`).slice(0, 12).join('; ');
      const sys = `You are an AI stylist. User: height ${profile.height}cm, weight ${profile.weight}kg, sizes ${profile.topSize}/${profile.pantsSize}/${profile.shoeSize}, budget ${profile.budget} RUB, styles ${(profile.styles || []).join(',')}, colors ${(profile.colors || []).join(',')}. Season ${ctx.season}, weather ${weather.temp != null ? weather.temp + 'C' : 'n/a'}. Wardrobe: ${wrSum || 'empty'} — prefer items matching it, fill gaps. Never ask what the profile already knows. Reply in Russian, max 2 short sentences. The message field is REQUIRED, never empty.`;
      const hist = chats[cid].slice(-4).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.text).slice(0, 200) }));
      const rawAnswer = await Q.chatJSON(CFG.qwen.stylist, { system: sys, user: msg + '\nHistory: ' + JSON.stringify(hist), required: [], tag: 'stylist', maxTokens: 350 });
      const answer = normalizeStylist(rawAnswer);
      /* Страховка: AI иногда возвращает пустые критерии — тогда берём
         детерминированный разбор сообщения как базу, AI — поверх. */
      const base = R.nlParse(msg);
      const aiCrit = answer.searchCriteria || {};
      const crit = Object.assign({ size: profile.topSize || '' }, base);
      ['category', 'subcategory', 'color', 'maxPrice', 'style', 'occasion'].forEach((k) => { if (aiCrit[k]) crit[k] = aiCrit[k]; });
      const pipe = await searchPipeline({ struct: crit, profile, feedback, limit: 50, wardrobe: wr });
      let text = answer.message;
      if (!text) {
        const bits = [crit.category ? ({ top: 'верх', bottom: 'низ', shoes: 'обувь', acc: 'аксессуары' })[crit.category] : '', crit.color, crit.maxPrice ? 'до ' + Number(crit.maxPrice).toLocaleString('ru-RU') + ' ₽' : ''].filter(Boolean);
        text = bits.length ? `Понял: ${bits.join(' · ')}. Показываю лучшее по твоему профилю.` : 'Подобрал варианты под твой профиль — смотри ниже.';
      }
      out = { intent: answer.intent, searchCriteria: crit, message: text, products: pipe.items, total: pipe.total, conversationId: cid, aiMode: 'production', model: CFG.qwen.stylist.model };
    } catch (e) {
      if (e.code === 'BAD_JSON') throw e;
      const d = demoBrain(msg, profile, ctx);
      const pipe = await searchPipeline({ struct: d.searchCriteria, profile, feedback, limit: 50, wardrobe: wr });
      const prefix = e.code === 'NO_FUNDS' ? 'Баланс шлюза на нуле — пополни счёт, и отвечу по-настоящему. А пока: ' : '';
      out = Object.assign({}, d, { message: prefix + d.message, products: pipe.items, total: pipe.total, conversationId: cid, aiMode: 'demo-fallback' });
    }
  }
  if (!out.products.length) out.message += '\n\nЖивые товары WB сейчас недоступны с этой сети, а выдуманных мы не показываем. Попробуй с другого интернета.';
  chats[cid].push({ role: 'ai', text: out.message, t: Date.now() });
  chats[cid] = chats[cid].slice(-30);
  if (uid) { require('./store').UD(uid).chats = chats; }
  save();
  return out;
}
/* ---------- EXPLANATION (§10): детерминированное «почему подходит» ----------
   Оценки считает RecommendationEngine, не AI. Формулировки честные:
   предположения, а не «научные метрики». */
async function explainProduct(productId, bodyProduct, uid) {
  const service = new M.MarketplaceService();
  let p = bodyProduct || null;
  if (!p) {
    p = await service.getProduct(productId);
    if (!p) {
      const d = C.DemoProductProvider.getById(productId);
      if (d) p = M.toModel(d);
    }
  } else p = M.toModel(p);
  if (!p) throw Q.err('NOT_FOUND', 'Товар не найден', 404);
  const store = require('./store');
  const U = uid ? store.UD(uid) : { profile: null, feedback: null };
  const profile = (U.profile) || {};
  const fb = U.feedback || { likes: {}, dislikes: {}, styleW: {}, colorW: {} };
  const ctx = scoreCtx(profile, fb, { wardrobe: (uid && U.wardrobe) || [] });
  const r = R.scoreProduct(Object.assign({ seasons: ['spring', 'summer', 'autumn', 'winter'] }, p), ctx);
  const scored = Object.assign({}, p, { aiScore: r.score, aiParts: r.parts });
  let analysis = null;
  if (!p.live) {
    try { analysis = await productAnalysis(p.id); } catch (e) { /* без анализа — честно */ }
  }
  const ex = R.explain(scored, profile, analysis);
  const b = r.parts;
  return {
    productId: p.id, score: r.score,
    breakdown: { style: b.style, color: b.color, fit: b.body, size: b.size, budget: b.budget, quality: b.quality },
    factors: ex.factors, reviewSummary: ex.reviewSummary,
    source: p.live ? p.source : 'demo',
    note: 'Оценки — эвристика AI-стилиста под твой профиль, а не объективная метрика качества.'
  };
}
module.exports = { analyzePhoto, productAnalysis, searchPipeline, scoreCtx, chat, getWeather, demoVision, explainProduct };
