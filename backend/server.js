'use strict';
/* server.js — HTTP API без внешних зависимостей (Node 18+).
   Запуск: npm start (порт из PORT, по умолчанию 8001).
   Этот же сервер раздаёт frontend (index.html/styles.css/app.js) — same origin для /api. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { CFG } = require('./lib/config');
const { db, save, logHistory, getCache, setCache, UD } = require('./lib/store');
const Q = require('./lib/qwen');
const C = require('./lib/catalog');
const R = require('./lib/recommend');
const O = require('./lib/orchestrator');
const M = require('./lib/market');
const A = require('./lib/auth');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
/* rate limiting: 60 req/min с IP; auth — строже (10/мин против перебора) */
const hits = new Map();
const authHits = new Map();
function rateOk(ip) {
  const now = Date.now(); const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length <= CFG.limits.ratePerMin;
}
function authRateOk(ip) {
  const now = Date.now(); const arr = (authHits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); authHits.set(ip, arr);
  return arr.length <= 10;
}
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > CFG.limits.bodyBytes) { reject(Q.err('TOO_LARGE', 'Тело запроса слишком большое', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); } catch { reject(Q.err('BAD_REQUEST', 'Некорректный JSON', 400)); }
    });
    req.on('error', () => reject(Q.err('NETWORK', 'Ошибка соединения', 500)));
  });
}
function userError(e) {
  const map = { TIMEOUT: 'AI долго отвечает. Показываем сохранённые рекомендации.', RATE_LIMIT: 'Слишком много запросов. Подожди минуту.', AUTH: e.message, AUTH_REQUIRED: 'Войди или зарегистрируйся — сессия истекла.', NO_FUNDS: e.message, NO_VISION: e.message, UNAVAILABLE: 'Не удалось обновить AI-рекомендации. Показываем сохранённые рекомендации.', NO_SOURCE: e.message, NOT_FOUND: 'Не найдено', BAD_REQUEST: e.message, TOO_LARGE: e.message, BAD_IMAGE: e.message };
  return map[e.code] || 'Что-то пошло не так. Попробуй ещё раз.';
}
const DEFAULT_PROFILE = { name: 'Артём', height: 190, weight: 85, gender: 'male', topSize: 'L', pantsSize: '32', shoeSize: '43', build: 'athletic', styles: ['smart', 'minimal'], budget: 5000, colors: ['black', 'white', 'olive', 'beige'], categories: ['top', 'bottom', 'shoes'] };
function profile(U) { return (U && U.profile) || DEFAULT_PROFILE; }
function feedback(U) { return (U && U.feedback) || { likes: {}, dislikes: {}, styleW: {}, colorW: {} }; }
/* Токен из Authorization: Bearer. Бросает 401 без валидной сессии. */
function authUid(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const u = A.getUserByToken(t);
  if (!u) { const e = Q.err('AUTH_REQUIRED', 'need auth', 401); throw e; }
  return u.id;
}
/* Публичные ручки (без токена). Всё остальное /api — только со входом. */
const PUBLIC_API = ['/api/status', '/api/context', '/api/market/wb/search', '/api/market/ozon/search', '/api/market/link', '/api/collector/push', '/api/collector/status'];

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname; const m = req.method;
  const ip = req.socket.remoteAddress || '?';
  if (!rateOk(ip)) return send(res, 429, { ok: false, error: 'Слишком много запросов. Подожди минуту.' });
  console.log(new Date().toISOString(), m, p);

  /* --- static frontend --- */
  if (m === 'GET' && (p === '/' || p === '/index.html' || p === '/styles.css' || p === '/app.js' || p === '/demo.js')) {
    const f = p === '/' ? '/index.html' : p;
    const fp = path.join(ROOT, f);
    if (!fp.startsWith(ROOT)) return send(res, 403, { ok: false });
    try {
      const data = fs.readFileSync(fp);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain', 'Cache-Control': 'no-store' });
      return res.end(data);
    } catch { return send(res, 404, { ok: false }); }
  }
  if (!p.startsWith('/api/')) return send(res, 404, { ok: false, error: 'Не найдено' });

  try {
    /* --- auth (публично, строгий лимит) --- */
    if (p.startsWith('/api/auth/')) {
      if (!authRateOk(ip)) return send(res, 429, { ok: false, code: 'RATE_LIMIT', error: 'Слишком много попыток входа. Подожди минуту.' });
    }
    if (p === '/api/auth/register' && m === 'POST') {
      const b = await readBody(req);
      const token = A.register(b.login, b.password);
      return send(res, 200, { ok: true, token, login: String(b.login).toLowerCase() });
    }
    if (p === '/api/auth/login' && m === 'POST') {
      const b = await readBody(req);
      const out = A.login(b.login, b.password);
      return send(res, 200, { ok: true, token: out.token, login: out.login });
    }
    if (p === '/api/auth/logout' && m === 'POST') {
      const b = await readBody(req);
      A.logout(b.token || '');
      return send(res, 200, { ok: true });
    }
    /* --- status / context --- */
    if (m === 'GET' && p === '/api/status') return send(res, 200, { ok: true, aiMode: CFG.aiMode, demoMode: CFG.demoMode, dataSource: CFG.dataSource, store: process.env.DATABASE_URL ? 'pg' : 'json', season: R.currentSeason(), usage: db.usage || {}, providers: { vision: Q.isConfigured(CFG.qwen.vision), stylist: Q.isConfigured(CFG.qwen.stylist), product: Q.isConfigured(CFG.qwen.product) } });
    if (m === 'GET' && p === '/api/context') {
      const w = await O.getWeather();
      return send(res, 200, { ok: true, season: R.currentSeason(), weather: w });
    }
    const isPublic = p.startsWith('/api/auth/') || PUBLIC_API.includes(p) || p === '/api/status' || p === '/api/context';
    const uid = isPublic ? null : authUid(req);
    const U = uid ? UD(uid) : null;
    /* --- profile --- */
    if (m === 'GET' && p === '/api/profile') return send(res, 200, { ok: true, profile: profile(U), vision: U.vision || null });
    if (m === 'PUT' && p === '/api/profile') {
      const b = await readBody(req);
      const v = b.profile || {};
      const clean = {
        name: String(v.name || 'Артём').slice(0, 40),
        height: Math.max(140, Math.min(220, parseInt(v.height) || 190)),
        weight: Math.max(40, Math.min(200, parseInt(v.weight) || 85)),
        gender: v.gender === 'female' ? 'female' : 'male',
        topSize: String(v.topSize || 'L').slice(0, 6), pantsSize: String(v.pantsSize || '32').slice(0, 6), shoeSize: String(v.shoeSize || '43').slice(0, 6),
        build: ['slim', 'average', 'athletic', 'plus'].includes(v.build) ? v.build : 'average',
        styles: Array.isArray(v.styles) ? v.styles.filter((s) => R.STYLE_RU[s]).slice(0, 6) : [],
        budget: Math.max(500, Math.min(500000, parseInt(v.budget) || 5000)),
        colors: Array.isArray(v.colors) ? v.colors.filter((c) => R.COLOR_RU[c]).slice(0, 8) : []
      };
      U.profile = clean; save(); logHistory('profile', 'Профиль обновлён', uid);
      return send(res, 200, { ok: true, profile: clean });
    }
    if (m === 'DELETE' && p === '/api/profile') {
      const fresh = { profile: null, vision: null, favorites: [], outfits: [], wardrobe: [], feedback: { likes: {}, dislikes: {}, styleW: {}, colorW: {} }, history: [], chats: {} };
      Object.keys(fresh).forEach((k) => { U[k] = fresh[k]; });
      save(); return send(res, 200, { ok: true });
    }
    /* --- vision --- */
    if (m === 'POST' && p === '/api/analyze-photo') {
      const b = await readBody(req);
      const out = await O.analyzePhoto({ image: b.image, profile: profile(U) });
      U.vision = out; save(); logHistory('ai', 'Vision-профиль создан', uid);
      return send(res, 200, { ok: true, vision: out });
    }
    /* --- search / recommendations --- */
    if (m === 'POST' && (p === '/api/search' || p === '/api/recommendations')) {
      const b = await readBody(req);
      const struct = b.struct || R.nlParse(b.query || '');
      const pipe = await O.searchPipeline({ struct, text: b.query || '', profile: profile(U), feedback: feedback(U), limit: b.limit || 20, wardrobe: U.wardrobe });
      const key = JSON.stringify(struct);
      require('./lib/store').setCache('recs', key, { items: pipe.items.map((x) => x.id), ts: Date.now() });
      return send(res, 200, { ok: true, total: pipe.total, items: pipe.items, source: pipe.source });
    }
    /* --- outfits --- */
    if (m === 'POST' && p === '/api/outfits') {
      const b = await readBody(req);
      const pipe = await O.searchPipeline({ struct: {}, profile: profile(U), feedback: feedback(U), limit: 24, wardrobe: U.wardrobe });
      const outs = R.buildOutfits(pipe.items, profile(U), b.count || 3).map((o) => Object.assign({}, o, {
        items: o.items.map((id) => pipe.items.find((x) => x.id === id)).filter(Boolean),
        why: ['соответствует твоему стилю', 'подходит по цветам', 'подходит по параметрам', 'соответствует сезону', 'укладывается в бюджет']
      }));
      return send(res, 200, { ok: true, outfits: outs });
    }
    /* --- products --- */
    const pm = p.match(/^\/api\/products\/([a-z0-9]+)(\/reviews|\/analysis|\/explanation|\/availability)?$/i);
    if (m === 'GET' && pm) {
      let prod = C.DemoProductProvider.getById(pm[1]);
      if (!prod && String(pm[1]).startsWith('ds')) {
        const D = require('./lib/datasets');
        const rows = await D.ensureLoaded().catch(() => []);
        prod = rows.find((x) => x.id === pm[1]) || null;
      }
      if (pm[2] === '/explanation') return send(res, 200, { ok: true, data: await O.explainProduct(pm[1], null, uid) });
      if (pm[2] === '/availability') {
        const service = new M.MarketplaceService();
        const av = await service.getAvailability(pm[1]);
        if (!av) return send(res, 404, { ok: false, error: 'Товар не найден' });
        return send(res, 200, { ok: true, data: Object.assign({ productId: pm[1] }, av) });
      }
      if (!prod) return send(res, 404, { ok: false, error: 'Товар не найден' });
      if (pm[2] === '/reviews') {
        if (String(pm[1]).startsWith('ds')) return send(res, 200, { ok: true, data: { productId: pm[1], source: 'dataset', rating: prod.rating, count: prod.reviews, reviews: [], note: 'Тексты отзывов в открытом датасете отсутствуют — смотри рейтинг и число оценок, детали на странице WB.' } });
        return send(res, 200, { ok: true, data: C.getReviews(pm[1]) });
      }
      if (pm[2] === '/analysis') return send(res, 200, { ok: true, data: await O.productAnalysis(pm[1]) });
      const r = R.scoreProduct(prod, O.scoreCtx(profile(U), feedback(U), { wardrobe: U.wardrobe }));
      return send(res, 200, { ok: true, product: Object.assign({}, prod, { aiScore: r.score, aiParts: r.parts, url: C.mpSearchUrl(prod) }) });
    }
    if (m === 'POST' && p === '/api/product-analysis') {
      const b = await readBody(req);
      return send(res, 200, { ok: true, data: await O.productAnalysis(b.productId) });
    }
    if (m === 'POST' && p === '/api/products/explanation') {
      const b = await readBody(req);
      return send(res, 200, { ok: true, data: await O.explainProduct(b.productId, b.product || null, uid) });
    }
    /* --- chat --- */
    if (m === 'POST' && p === '/api/ai/chat') {
      const b = await readBody(req);
      const out = await O.chat({ message: b.message, conversationId: b.conversationId, profile: profile(U), feedback: feedback(U), uid, wardrobe: U.wardrobe, image: b.image || null });
      return send(res, 200, { ok: true, data: out });
    }
    /* --- feedback / favorites / history --- */
    if (m === 'POST' && p === '/api/feedback') {
      const b = await readBody(req);
      const { productId, kind, reason } = b;
      const FB = feedback(U);
      if (kind === 'like') {
        FB.likes[productId] = true; delete FB.dislikes[productId];
        const pr = C.DemoProductProvider.getById(productId);
        if (pr) { pr.styles.forEach((s) => { FB.styleW[s] = (FB.styleW[s] || 0) + 0.05; }); pr.colors.forEach((c) => { FB.colorW[c] = (FB.colorW[c] || 0) + 0.05; }); }
      } else {
        FB.dislikes[productId] = reason || 'dislike'; delete FB.likes[productId];
      }
      U.feedback = FB;
      save(); logHistory('feedback', `${kind}: ${productId}`, uid);
      return send(res, 200, { ok: true });
    }
    if (m === 'GET' && p === '/api/favorites') return send(res, 200, { ok: true, favorites: U.favorites });    if (m === 'POST' && p === '/api/favorites') {
      const b = await readBody(req);
      if (b.action === 'remove') U.favorites = U.favorites.filter((x) => x !== b.productId);
      else if (b.productId && !U.favorites.includes(b.productId)) U.favorites.push(b.productId);
      save(); return send(res, 200, { ok: true, favorites: U.favorites });
    }
    if (m === 'GET' && p === '/api/history') return send(res, 200, { ok: true, history: U.history.slice(0, 50) });
    /* --- market: живые данные --- */
    if (m === 'GET' && p === '/api/market/wb/search') {
      const q = String(url.searchParams.get('q') || '').slice(0, 80);
      const limit = Math.min(24, parseInt(url.searchParams.get('limit')) || 12);
      if (!q) return send(res, 400, { ok: false, error: 'Пустой запрос' });
      const key = 'wb:' + q + ':' + limit;
      const hit = getCache('market', key, 10 * 60 * 1000);
      if (hit) return send(res, 200, { ok: true, items: hit, cached: true });
      const items = await M.wbSearchServer(q, limit);
      setCache('market', key, items);
      return send(res, 200, { ok: true, items, cached: false });
    }
    if (m === 'GET' && p === '/api/market/ozon/search') {
      try { await M.ozonSearchServer(); }
      catch (e) { return send(res, e.status || 503, { ok: false, code: e.code, error: e.message }); }
    }
    if (m === 'POST' && p === '/api/market/score') {
      const b = await readBody(req);
      const items = Array.isArray(b.items) ? b.items.slice(0, 100) : [];
      const struct = b.struct || {};
      const scored = M.scoreLive(items, O.scoreCtx(profile(U), feedback(U), { occasion: struct.occasion, wardrobe: U.wardrobe }));
      return send(res, 200, { ok: true, items: scored });
    }
    /* --- collector: домашний мост каталога. Авторизация — секретом
       x-collector-key (не user-токеном), рубильник — COLLECTOR_ENABLED. --- */
    if ((m === 'POST' && p === '/api/collector/push') || (m === 'GET' && p === '/api/collector/status') || (m === 'OPTIONS' && p.startsWith('/api/collector/'))) {
      /* Расширение ходит с chrome-extension:// origin — отдаём CORS только этой ветке. */
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-collector-key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (m === 'OPTIONS') { res.writeHead(200); res.end(); return; }
      const HF = require('./lib/homefeed');
      if (m === 'GET') return send(res, 200, { ok: true, data: HF.stats() });
      const key = String(req.headers['x-collector-key'] || '');
      if (!process.env.COLLECTOR_KEY || key !== process.env.COLLECTOR_KEY)
        return send(res, 403, { ok: false, code: 'AUTH', error: 'Нет доступа' });
      if (!HF.enabled()) return send(res, 503, { ok: false, code: 'DISABLED', error: 'Мост выключен (COLLECTOR_ENABLED)' });
      const b = await readBody(req);
      if (!Array.isArray(b.items)) return send(res, 400, { ok: false, error: 'Нужен items[]' });
      const out = HF.setItems(b.items);
      logHistory('collector', `Мост: принято ${out.accepted}`, uid);
      return send(res, 200, { ok: true, data: out });
    }
    /* Партнёрская обёртка ссылки: frontend зовёт перед открытием магазина. */
    if (m === 'GET' && p === '/api/market/link') {
      const u = String(url.searchParams.get('u') || '').slice(0, 500);
      const mp = url.searchParams.get('mp') === 'OZON' ? 'OZON' : 'WB';
      if (!/^https:\/\/(www\.)?(wildberries\.ru|ozon\.ru)\//.test(u)) return send(res, 400, { ok: false, error: 'Только ссылки WB/Ozon' });
      return send(res, 200, { ok: true, data: M.affLink(mp, u) });
    }
    /* --- wardrobe: вещи пользователя + AI-оценка вкуса --- */
    if (m === 'GET' && p === '/api/wardrobe') {
      return send(res, 200, { ok: true, items: U.wardrobe, insights: R.wardrobeInsights(U.wardrobe) });
    }
    if (m === 'POST' && p === '/api/wardrobe') {
      const b = await readBody(req);
      const v = b.item || {};
      const title = String(v.title || '').trim().slice(0, 60);
      if (!title) return send(res, 400, { ok: false, error: 'Назови вещь — например «чёрное худи»' });
      if (!['top', 'bottom', 'shoes', 'acc'].includes(v.cat)) return send(res, 400, { ok: false, error: 'Выбери категорию' });
      const item = {
        id: 'w' + Date.now(),
        title,
        cat: v.cat,
        colors: Array.isArray(v.colors) ? v.colors.filter((c) => R.COLOR_RU[c]).slice(0, 2) : [],
        styles: Array.isArray(v.styles) ? v.styles.filter((s) => R.STYLE_RU[s]).slice(0, 3) : [],
        note: String(v.note || '').slice(0, 120),
        photo: (typeof v.photo === 'string' && v.photo.startsWith('data:image/') && v.photo.length <= 600000) ? v.photo : null,
        addedAt: Date.now()
      };
      U.wardrobe.unshift(item);
      save(); logHistory('wardrobe', 'В гардероб: ' + title, uid);
      return send(res, 200, { ok: true, item, insights: R.wardrobeInsights(U.wardrobe) });
    }
    if (m === 'DELETE' && p === '/api/wardrobe') {
      const b = await readBody(req);
      U.wardrobe = (U.wardrobe || []).filter((x) => x.id !== b.id);
      save(); return send(res, 200, { ok: true, insights: R.wardrobeInsights(U.wardrobe) });
    }
    return send(res, 404, { ok: false, error: 'Не найдено' });
  } catch (e) {
    console.error('API error', p, e.code || '', e.message);
    return send(res, e.status || 500, { ok: false, code: e.code || 'ERROR', error: userError(e), demoFallback: true });
  }
}
const HOST = process.env.HOST || '0.0.0.0';
const store = require('./lib/store');
store.init().then(() => {
  http.createServer(route).listen(CFG.port, HOST, () => {
    console.log(`sainvio backend on http://${HOST}:${CFG.port}  aiMode=${CFG.aiMode} data=${CFG.dataSource} season=${R.currentSeason()}`);
  });
}).catch((e) => { console.error('store init failed:', e.message); process.exit(1); });
