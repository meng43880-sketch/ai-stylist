/* sainvio v3 — минимализм. Главная = чат + лента, они связаны:
   ответы AI содержат вещи/образы, одной кнопкой уходят в ленту.
   Каталог и скоринг — backend (/api). Фото и черновики — локально. */
'use strict';

/* ---------- utils ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('ru-RU') + ' ₽';
const FALLBACK = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80';
window.__fb = function (el) { el.onerror = null; el.src = FALLBACK; };
const IM = (src, alt) => `<img src="${src}" alt="${esc(alt || '')}" loading="lazy" onerror="__fb(this)">`;
function toast(t) {
  const d = document.createElement('div'); d.className = 'toastmsg'; d.textContent = t;
  $('#toasts').appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .3s'; setTimeout(() => d.remove(), 300); }, 2200);
}

/* ---------- icons: один stroke-стиль ---------- */
const P = {
  spark: '<path d="M12 3c.7 4.6 2.6 6.5 7.2 7.2-4.6.7-6.5 2.6-7.2 7.2-.7-4.6-2.6-6.5-7.2-7.2 4.6-.7 6.5-2.6 7.2-7.2z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  shirt: '<path d="M9 3.5 4 6l-1.5 4L6 11.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5L21 10 19.5 6 15 3.5a3 3 0 0 1-6 0z"/>',
  heart: '<path d="M12 20.5S3 15 3 8.8C3 6 5.2 4 7.8 4c1.7 0 3.2.9 4.2 2.3C13 4.9 14.5 4 16.2 4 18.8 4 21 6 21 8.8c0 6.2-9 11.7-9 11.7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M4 12 20 5l-7 15-2.3-6.2z"/><path d="M9.7 14.3 20 5"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 7h9M17.5 7H20M4 17h3M11.5 17H20"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>',
  trash: '<path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13"/>',
  upRight: '<path d="M7 17 17 7M9 7h8v8"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6z"/><path d="M9 12l2 2 4-4"/>',
  hanger: '<circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V8M12 8l-8 9.5h16z"/>'
};
const ic = (n, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
function spark(size) { return ic('spark', size || 13); }

/* ---------- api ---------- */
const Api = {
  async req(path, opts, ms) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms || 15000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      try { if (typeof S !== 'undefined' && S.token) headers.Authorization = 'Bearer ' + S.token; } catch (e) {}
      const r = await fetch(path, Object.assign({ headers, signal: c.signal }, opts || {}));
      const j = await r.json();
      if (!r.ok || !j.ok) {
        const e = new Error((j && j.error) || ('HTTP ' + r.status)); e.code = (j && j.code) || 'ERR'; e.status = r.status;
        if (e.code === 'AUTH_REQUIRED' && window.__on401) window.__on401();
        throw e;
      }
      return j;
    } finally { clearTimeout(t); }
  },
  get: (p) => Api.req(p, { method: 'GET' }),
  post: (p, b, ms) => Api.req(p, { method: 'POST', body: JSON.stringify(b || {}) }, ms)
};
const RC = {}; // товары из ответов AI (сессия)

/* ---------- WBClient: живой поиск Wildberries прямо из браузера ----------
   WB отдаёт открытый поисковый API без ключа и с открытым CORS.
   Схема нормализации зеркалит backend/lib/market.js. Если сеть режет WB —
   тихо возвращаем [] и работает демо-каталог. Ozon открытого API не даёт
   (антибот) — для него только честная ссылка на поиск (см. market()). */
const WBClient = {
  ranges: [[143, '01'], [287, '02'], [431, '03'], [575, '04'], [719, '05'], [863, '06'], [1007, '07'], [1151, '08'], [1295, '09'], [1439, '10'], [1583, '11'], [1727, '12'], [1871, '13'], [2015, '14'], [2159, '15'], [2303, '16'], [2447, '17'], [2591, '18'], [2735, '19'], [2879, '20'], [3023, '21'], [3167, '22'], [3311, '23'], [3455, '24'], [3599, '25'], [3743, '26'], [3887, '27'], [4031, '28'], [4175, '29'], [4319, '30'], [4463, '31'], [4607, '32'], [4751, '33']],
  host(vol) { for (const [m, h] of this.ranges) if (vol <= m) return h; return '33'; },
  photo(id) { const vol = Math.floor(id / 100000), part = Math.floor(id / 1000); return `https://basket-${this.host(vol)}.wb.ru/vol${vol}/part${part}/${id}/photos/big/1.webp`; },
  colors(names) {
    const out = [];
    (names || []).forEach((n) => {
      const s = String(n).toLowerCase();
      [['черн', 'black'], ['бел', 'white'], ['сер', 'gray'], ['беж', 'beige'], ['олив', 'olive'], ['хаки', 'olive'], ['зелен', 'green'], ['зелён', 'green'], ['син', 'blue'], ['голуб', 'blue'], ['коричн', 'brown']].forEach(([k, v]) => { if (s.includes(k) && !out.includes(v)) out.push(v); });
    });
    return out.slice(0, 2);
  },
  cat(name) {
    const s = String(name || '').toLowerCase();
    const t = [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['свитер', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['рюкзак', 'acc'], ['сумк', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc'], ['ремен', 'acc'], ['шапк', 'acc']];
    for (const [k, v] of t) if (s.includes(k)) return v;
    return 'top';
  },
  styles(name) {
    const s = String(name || '').toLowerCase(); const out = [];
    if (/оверсайз|oversize/.test(s)) out.push('oversize', 'street');
    if (/спорт|бегов/.test(s)) out.push('sport');
    if (/классич/.test(s)) out.push('classic');
    if (/делов|офис|бизнес/.test(s)) out.push('business', 'smart');
    if (/минимал|базов/.test(s)) out.push('minimal', 'casual');
    if (/худи|карго|стрит/.test(s)) out.push('street', 'casual');
    if (/кожан|вечерн/.test(s)) out.push('party');
    return [...new Set(out)].slice(0, 3);
  },
  norm(raw) {
    const id = raw.id || raw.nmId;
    if (!id) return null;
    const price = Math.round((raw.salePriceU != null ? raw.salePriceU : raw.salePrice) / 100) || 0;
    if (!price) return null;
    const old = Math.round((raw.priceU != null ? raw.priceU : raw.price) / 100) || price;
    const sizes = (raw.sizes || []).map((x) => String((x && (x.origName || x.name)) || x)).filter((x) => x && x.length <= 8).slice(0, 8);
    return {
      id: 'wb' + id, title: String(raw.name || 'Товар Wildberries').slice(0, 120),
      price, old: old > price ? old : Math.round(price * 1.2),
      img: this.photo(id), mp: 'WB', brand: String(raw.brand || '').slice(0, 40),
      cat: this.cat(raw.name), colors: this.colors((raw.colors || []).map((c) => (c && c.name) || c)),
      sizes: sizes.length ? sizes : ['One'], styles: this.styles(raw.name), fit: 'regular',
      rating: Number(raw.reviewRating || raw.rating) || 0, reviews: Number(raw.feedbacks || 0),
      live: true, source: 'wb', url: `https://www.wildberries.ru/catalog/${id}/detail.aspx`, fetchedAt: Date.now(), desc: ''
    };
  },
  /* Свежая полоса под запрос: 1 страница WB (~до 30) прямо из браузера
     пользователя (его IP обычно пускают). Мёртвые прокси выкинуты:
     allorigins висит, corsproxy.io требует ключ — только тормозят. */
  async searchText(text, limit) {
    const n = Math.min(30, Math.max(1, limit || 10));
    const q = encodeURIComponent(String(text || '').slice(0, 60));
    if (!q) return [];
    const target = `https://search.wb.ru/exactmatch/ru/common/v18/search?ab_testing=false&appType=1&curr=rub&dest=-1257786&page=1&query=${q}&resultset=catalog&sort=popular&spp=30&suppressSpellcheck=false`;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    try {
      const r = await fetch(target, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const seen = new Set(), out = [];
      (((j && j.data && j.data.products) || [])).map((x) => this.norm(x)).forEach((p) => {
        if (!p || seen.has(p.id)) return;
        seen.add(p.id); out.push(p);
      });
      return out.slice(0, n);
    } catch (e) {
      return [];
    } finally { clearTimeout(t); }
  }
};

/* ---------- state ---------- */
const LS = 'sainvio_v3';
const LS_LEGACY = 'stylist_v3';
const LS_W = 'sainvio_v3_w';
const LS_W_LEGACY = 'stylist_v3_w';
/* Владелец сервиса (152-ФЗ, ст.10 149-ФЗ). ЗАПОЛНИ перед запуском в РФ. */
const OPERATOR = { name: '[ИП/ООО, ФИО]', inn: '[ИНН]', email: '[email для запросов по ПДн]', address: '[адрес]' };
const LS_COOKIE = 'sainvio_cookie';
function cookieChoice() { try { return localStorage.getItem(LS_COOKIE); } catch (e) { return null; } }
window.cookieAccept = function (v) { try { localStorage.setItem(LS_COOKIE, JSON.stringify({ v, t: Date.now() })); } catch (e) {} clearTimeout(window.__cookieT); __cookieDeadline = 0; const b = document.getElementById('cookiebar'); if (b) b.remove(); };
let __cookieDeadline = 0;
function cookieBanner() {
  if (cookieChoice()) return '';
  return `<div class="cookiebar pre" id="cookiebar"><p>Мы используем cookie и локальное хранилище только для работы sainvio (вход, подборки, гардероб). Рекламных трекеров нет. Подробнее — <a onclick="go('privacy')">в политике</a>.</p><div class="row"><button class="btn" style="flex:1" onclick="cookieAccept('all')">Принять</button><button class="btn ghost" style="flex:1" onclick="cookieAccept('essential')">Только необходимые</button></div></div>`;
}
function scheduleCookieBar() {
  const b = document.getElementById('cookiebar');
  if (!b) return;
  if (cookieChoice()) { b.remove(); return; }
  if (!__cookieDeadline) __cookieDeadline = Date.now() + 10000;
  clearTimeout(window.__cookieT);
  window.__cookieT = setTimeout(() => {
    const el = document.getElementById('cookiebar');
    if (el && !cookieChoice()) el.classList.remove('pre');
  }, Math.max(0, __cookieDeadline - Date.now()));
}
const STYLES = [['casual', 'Повседневный'], ['smart', 'Smart casual'], ['street', 'Streetwear'], ['minimal', 'Минимализм'], ['sport', 'Спорт'], ['oldmoney', 'Old money'], ['business', 'Деловой'], ['classic', 'Классика'], ['oversize', 'Oversize'], ['party', 'На выход']];
const SEASON_RU = { spring: 'Весна', summer: 'Лето', autumn: 'Осень', winter: 'Зима' };
let S = {
  route: 'welcome', params: {},
  profile: { name: '', height: '', weight: '', gender: '', topSize: '', pantsSize: '', shoeSize: '', build: '', styles: [], budget: 5000, colors: [] },
  photo: null, aiNote: '', done: false,
  favorites: [], savedOutfits: [], chat: [], cid: null,
  feed: { title: 'Для тебя', items: [], total: 0 },
  feedOutfits: [], gapItems: [], wardrobe: { items: [], insights: null },
  ctx: { season: 'autumn', weather: null },
  ob: { styles: [] }, greeted: false,
  token: null, login: '', authMode: 'login', authErr: '',
  photoConsent: false
};
try {
  const raw = localStorage.getItem(LS) || localStorage.getItem(LS_LEGACY);
  if (raw) { const p = JSON.parse(raw); if (p) S = Object.assign(S, p); }
} catch (e) {}
S.route = (S.done && S.token) ? 'home' : 'welcome'; S.params = {};
function save() {
  try { localStorage.setItem(LS, JSON.stringify({ profile: S.profile, photo: S.photo, photoConsent: S.photoConsent, aiNote: S.aiNote, done: S.done, favorites: S.favorites, savedOutfits: S.savedOutfits, chat: S.chat.slice(-30).map((m) => { const c = Object.assign({}, m); delete c.img; return c; }), cid: S.cid, ob: S.ob, greeted: S.greeted, token: S.token, login: S.login, aiModel: S.aiModel })); } catch (e) {}
}

/* ---------- router ---------- */
const NEED_AUTH = ['home', 'results', 'product', 'outfit', 'outfits', 'favorites', 'profile', 'wardrobe'];
function go(route, params) {
  if (!S.token && NEED_AUTH.includes(route)) { route = 'auth'; params = {}; }
  S.route = route; S.params = params || {}; render(); const a = $('#app'); if (a) a.scrollTop = 0;
}
window.go = go;
window.__on401 = function () {
  S.token = null; save();
  if (NEED_AUTH.includes(S.route)) { S.authErr = 'Сессия истекла — войди заново.'; go('auth'); }
};
const TABS = [['home', 'Главная', 'home'], ['outfits', 'Образы', 'shirt'], ['wardrobe', 'Гардероб', 'hanger'], ['favorites', 'Сохранённое', 'heart'], ['profile', 'Профиль', 'user']];
function render() {
  const v = { welcome: vWelcome, auth: vAuth, photo: vPhoto, params: vParams, style: vStyle, analyzing: vAnalyzing, home: vHome, results: vResults, product: () => vProduct(S.params.id), outfit: () => vOutfit(S.params.id), outfits: vOutfits, favorites: vFav, profile: vProfile, wardrobe: vWardrobe, privacy: vPrivacy, terms: vTerms }[S.route] || vWelcome;
  $('#app').innerHTML = `<div class="screen">${v()}</div>` + cookieBanner();
  scheduleCookieBar();
  const main = ['home', 'outfits', 'wardrobe', 'favorites', 'profile'].includes(S.route);
  const tabs = $('#tabs');
  tabs.hidden = !main;
  try {
    const appEl = $('#app');
    if (appEl) appEl.classList.toggle('notabs', !main);
  } catch (e) {}
  if (main) tabs.innerHTML = TABS.map(([r, t, i]) => `<button class="tab ${S.route === r ? 'on' : ''}" onclick="go('${r}')" aria-label="${t}">${ic(i, 24)}${t}</button>`).join('');
  if (S.route === 'analyzing') runAnalyzing();
  if (S.route === 'home') { loadCtx(); scrollMsgs(); }
}

/* ---------- onboarding ---------- */
const HERO = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80';
function dots(n) { return `<div class="stepdot">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`; }
function vWelcome() {
  return `<div class="hero-full screen">
    ${IM(HERO, 'sainvio')}
    <div class="shade"></div>
    <div class="topbar"><span class="wordmark">sainvio</span></div>
    <div class="body">
      <h1>Скажу,<br>что <em>надеть</em></h1>
      <p>Подберём вещи и соберём образы под твою внешность, вкус и бюджет.</p>
      <button class="btn light" onclick="enterApp()">Начать</button>
      <div class="foot">1 минута · Фото · Параметры · Подборка</div>
    </div>
  </div>`;
}
window.enterApp = function () {
  if (S.token) go(S.done ? 'home' : 'photo');
  else go('auth');
};
/* ---------- auth: логин и пароль ---------- */
function vAuth() {
  const reg = S.authMode === 'register';
  return `<div class="wrap" style="padding-top:64px">
    <div class="sbrand">sainvio</div>
    <h1 class="title" style="margin-top:16px">${reg ? 'Создать аккаунт' : 'С возвращением'}</h1>
    <p class="sub">${reg ? 'Логин и пароль — вещи, лента и вкусы привяжутся к тебе.' : 'Войди, чтобы продолжить с того же места.'}</p>
    <div class="chips" style="margin-top:16px"><button class="chip ${!reg ? 'on' : ''}" onclick="authTab('login')">Вход</button><button class="chip ${reg ? 'on' : ''}" onclick="authTab('register')">Регистрация</button></div>
    <div class="field"><label>Логин · латиница, цифры, _</label><input class="input" id="a_login" autocomplete="username" value="${esc(S.login || '')}" maxlength="20"></div>
    <div class="field"><label>Пароль · минимум 6 символов</label><input class="input" id="a_pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" value="${esc(DRAFT_PASS)}"></div>
    ${reg ? `<button class="agree" onclick="togAgree()" aria-label="Согласие">
      <span class="box ${S.agree ? 'on' : ''}">${S.agree ? ic('check', 13) : ''}</span>
      <span>Я ознакомился с <a onclick="event.stopPropagation();go('privacy')">политикой конфиденциальности</a> и согласен на обработку данных</span>
    </button>` : ''}
    ${S.authErr ? `<div class="note" style="background:#FDECEA;color:#8f1d12">${esc(S.authErr)}</div>` : ''}
    <div style="height:16px"></div>
    <button class="btn" onclick="authSubmit()">${reg ? 'Зарегистрироваться' : 'Войти'}</button>
    <p class="sub" style="text-align:center;margin-top:12px">Продолжая, принимаешь <a onclick="go('terms')">условия использования</a> и <a onclick="go('privacy')">политику</a></p>
    <div style="height:22px"></div></div>`;
}
window.authTab = function (m) { stashDraft(); S.authMode = m; S.authErr = ''; render(); };
let DRAFT_PASS = '';
function stashDraft() {
  const l = document.getElementById('a_login'), p = document.getElementById('a_pass');
  if (l) S.login = l.value;
  if (p) DRAFT_PASS = p.value;
}
window.togAgree = function () { stashDraft(); S.agree = !S.agree; render(); };
window.authSubmit = async function () {
  const login = (($('#a_login') || {}).value || '').trim();
  const pass = (($('#a_pass') || {}).value || '');
  DRAFT_PASS = pass; S.login = login;
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(login)) { S.authErr = 'Логин: 3–20 символов, латиница, цифры и _'; render(); return; }
  if (pass.length < 6) { S.authErr = 'Пароль: минимум 6 символов'; render(); return; }
  if (S.authMode === 'register' && !S.agree) { S.authErr = 'Поставь галочку согласия с политикой конфиденциальности'; render(); return; }
  S.authErr = ''; render();
  try {
    const r = await Api.post(S.authMode === 'register' ? '/api/auth/register' : '/api/auth/login', { login, password: pass });
    S.token = r.token; S.login = r.login; S._fed = S._ofed = S._wfed = false; save();
    if (S.authMode === 'register') { S.done = false; save(); go('photo'); }
    else await afterLogin();
  } catch (e) { S.authErr = e.message || 'Не получилось. Попробуй ещё раз.'; render(); }
};
async function pullServer() {
  try {
    const r = await Api.get('/api/profile');
    if (r.profile) { S.profile = r.profile; S.done = true; }
    try { const f = await Api.get('/api/favorites'); S.favorites = f.favorites || []; } catch (e) {}
    try { const w = await Api.get('/api/wardrobe'); S.wardrobe = { items: w.items || [], insights: w.insights || null }; } catch (e) {}
    save();
  } catch (e) {}
}
async function pushLocal() {
  try { await Api.post('/api/profile', { profile: S.profile }); } catch (e) {}
  try {
    const f = await Api.get('/api/favorites');
    if (!(f.favorites || []).length) for (const id of S.favorites) { try { await Api.post('/api/favorites', { productId: id }); } catch (e) {} }
    const w = await Api.get('/api/wardrobe');
    if (!(w.items || []).length) for (const it of (S.wardrobe.items || [])) { try { await Api.post('/api/wardrobe', { item: { title: it.title, cat: it.cat, colors: it.colors, styles: it.styles } }); } catch (e) {} }
  } catch (e) {}
}
async function afterLogin() {
  await pullServer();
  await pushLocal();
  go(S.done && S.profile ? 'home' : 'photo');
}
window.logout = async function () {
  try { await Api.post('/api/auth/logout', { token: S.token }); } catch (e) {}
  S.token = null; S.login = ''; S._fed = S._ofed = S._wfed = false; save(); go('auth');
};
function vPhoto() {
  return `<div class="wrap">${dots(1)}
    <h1 class="title">Покажи себя</h1><p class="sub">AI посмотрит на фото один раз — и дальше будет подбирать точнее.</p>
    <label class="photoframe" style="cursor:pointer">${S.photo ? `${IM(S.photo, 'Фото')}` : `<span class="ph">${ic('camera', 40)}<span style="display:block;margin-top:10px">Нажми, чтобы добавить фото<br>В полный рост, при хорошем свете</span></span>`}<input type="file" accept="image/*" hidden onchange="onPhoto(event)"></label>
    ${S.photo ? `<p class="sub" style="text-align:center">Нажми на фото, чтобы заменить</p>` : ''}
    <button class="agree" onclick="togPhotoConsent()" aria-label="Согласие на обработку фото">
      <span class="box ${S.photoConsent ? 'on' : ''}">${S.photoConsent ? ic('check', 13) : ''}</span>
      <span>Соглашаюсь на обработку фото (биометрические данные) и передачу AI-провайдеру для анализа внешности. <a onclick="event.stopPropagation();go('privacy')">Подробнее</a></span>
    </button>
    <div style="height:14px"></div>
    <button class="btn" onclick="goPhotoNext()">Дальше</button>
    <button class="link" style="width:100%;justify-content:center" onclick="S.photo=null;save();go('params')">Пропустить</button>
    <div style="height:24px"></div></div>`;
}
window.togPhotoConsent = function () { S.photoConsent = !S.photoConsent; save(); render(); };
window.goPhotoNext = function () {
  if (S.photo && !S.photoConsent) { toast('Поставь галочку согласия на обработку фото — или пропусти этот шаг'); return; }
  go('params');
};
window.onPhoto = function (e) {
  const f = e.target.files && e.target.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = () => { S.photo = r.result; S.photoConsent = true; save(); render(); };
  r.readAsDataURL(f);
};
function vParams() {
  const p = S.profile;
  const seg = (k, opts) => `<div class="chips">${opts.map(([v, t]) => `<button class="chip ${p[k] === v ? 'on' : ''}" onclick="setP('${k}','${v}')">${t}</button>`).join('')}</div>`;
  return `<div class="wrap">${dots(2)}
    <h1 class="title">Пара слов о тебе</h1>
    <div class="field"><label>Имя</label><input class="input" id="f_name" value="${esc(p.name)}" placeholder="Как тебя зовут?"></div>
    <div class="grid2"><div class="field"><label>Рост, см</label><input class="input" id="f_h" type="number" value="${p.height}" placeholder="180"></div>
    <div class="field"><label>Вес, кг</label><input class="input" id="f_w" type="number" value="${p.weight}" placeholder="75"></div></div>
    <div class="field"><label>Пол</label></div>${seg('gender', [['male', 'Мужской'], ['female', 'Женский']])}
    <div class="field"><label>Телосложение</label></div>${seg('build', [['slim', 'Стройное'], ['average', 'Среднее'], ['athletic', 'Спортивное'], ['plus', 'Плотное']])}
    <div class="grid3"><div class="field"><label>Верх</label><input class="input" id="f_top" value="${esc(p.topSize)}" placeholder="M"></div>
    <div class="field"><label>Низ</label><input class="input" id="f_pa" value="${esc(p.pantsSize)}" placeholder="31"></div>
    <div class="field"><label>Обувь</label><input class="input" id="f_sh" value="${esc(p.shoeSize)}" placeholder="42"></div></div>
    <div style="height:16px"></div>
    <button class="btn" onclick="saveParams()">Дальше</button><div style="height:24px"></div></div>`;
}
window.setP = function (k, v) { S.profile[k] = v; save(); render(); };
window.saveParams = function () {
  const g = (id) => { const el = document.getElementById(id); return (el ? el.value : '').trim(); };
  const fail = (t) => { toast(t); };
  const name = g('f_name');
  const height = parseInt(g('f_h')) || 0, weight = parseInt(g('f_w')) || 0;
  if (!name) return fail('Подскажи, как тебя зовут');
  if (!(height >= 140 && height <= 220)) return fail('Рост: число от 140 до 220');
  if (!(weight >= 40 && weight <= 200)) return fail('Вес: число от 40 до 200');
  if (!S.profile.gender) return fail('Выбери пол');
  if (!S.profile.build) return fail('Выбери телосложение');
  if (!g('f_top') || !g('f_pa') || !g('f_sh')) return fail('Заполни все три размера');
  Object.assign(S.profile, {
    name, height, weight,
    topSize: g('f_top'), pantsSize: g('f_pa'), shoeSize: g('f_sh')
  });
  if (S.done) {
    save();
    Api.post('/api/profile', { profile: S.profile }).catch(() => {});
    go('profile');
  } else { save(); go('style'); }
};
function vStyle() {
  return `<div class="wrap">${dots(3)}
    <h1 class="title">Твой стиль</h1><p class="sub">Можно несколько — или пропустить, разберёмся в диалоге.</p>
    <div class="chips">${STYLES.map(([k, t]) => `<button class="chip ${S.ob.styles.includes(k) ? 'on' : ''}" onclick="togOb('${k}')">${t}</button>`).join('')}</div>
    <div style="height:18px"></div>
    <button class="btn" onclick="finishOb(false)">Готово</button>
    <button class="link" style="width:100%;justify-content:center" onclick="finishOb(true)">Пропустить</button>
    <div style="height:24px"></div></div>`;
}
window.togOb = function (k) { const a = S.ob.styles; const i = a.indexOf(k); i >= 0 ? a.splice(i, 1) : a.push(k); save(); render(); };
window.finishOb = function (skip) {
  S.profile.styles = skip ? [] : S.ob.styles.slice();
  S.profile.colors = skip ? [] : S.profile.colors;
  save(); go('analyzing');
};
function vAnalyzing() {
  return `<div class="wrap" style="text-align:center;padding-top:70px">
    <span style="color:var(--green)">${ic('spark', 34)}</span>
    <h1 class="title" style="margin-top:14px">Смотрим профиль</h1>
    <p class="sub" id="anmsg">Анализируем параметры…</p></div>`;
}
/* Фото для Vision ужимаем до 512px: силуэт/цвета/стиль видны так же,
   а токенов картинки уходит примерно вдвое меньше. */
function shrinkPhoto(dataUrl) {
  return new Promise((res) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 512 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = img.width * k; c.height = img.height * k;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.75));
        } catch (e) { res(dataUrl); }
      };
      img.onerror = () => res(dataUrl); img.src = dataUrl;
    } catch (e) { res(dataUrl); }
  });
}
let __anRun = false;
async function runAnalyzing() {
  if (__anRun) return; __anRun = true;
  const say = (t) => { const el = document.getElementById('anmsg'); if (el) el.textContent = t; };
  try {
    await Api.post('/api/profile', { profile: S.profile });
    if (S.photo && S.photoConsent) {
      say('Смотрим фотографию…');
      const small = await shrinkPhoto(S.photo);
      if (small && small.length < 1300000) {
        try {
          const r = await Api.post('/api/analyze-photo', { image: small });
          const v = r.vision || {};
          const rec = v.recommended_styles || [];
          S.aiNote = rec.length ? 'AI по фото отметил: ' + rec.slice(0, 3).join(', ') + '. Это предположение, дальше уточним в диалоге.' : (v.summary || '');
        } catch (e) { /* без фото-анализа тоже ок */ }
      }
    }
    say('Собираем первую подборку…');
    await loadFeed('');
  } catch (e) { /* офлайн — покажем что есть */ }
  save();
  S.done = true; save(); __anRun = false;
  go('home');
}

/* ---------- data ---------- */
async function loadCtx() {
  try {
    const r = await Api.get('/api/context');
    S.ctx = { season: r.season || S.ctx.season, weather: r.weather || null };
    const el = document.getElementById('seasonline');
    if (el) el.innerHTML = seasonText();
  } catch (e) {}
}
function seasonText() {
  const w = S.ctx.weather;
  return `${SEASON_RU[S.ctx.season] || ''}${w && w.temp != null ? ` · ${w.temp}°C` : ''}`;
}
function demoFb() {
  const likes = {};
  S.favorites.forEach((id) => { likes[id] = true; });
  return { likes, dislikes: {}, wardrobe: (S.wardrobe && S.wardrobe.items) || [] };
}
async function loadFeed(query) {
  try {
    const r = await Api.post('/api/recommendations', query ? { query } : { struct: {} });
    (r.items || []).forEach((p) => { RC[p.id] = p; });
    S.feed = { title: query ? `«${query}»` : 'Для тебя', items: r.items || [], total: r.total || 0 };
  } catch (e) {
    const items = query ? Demo.search(Demo.parse(query), S.profile, demoFb()) : Demo.rank(Demo.PRODUCTS, S.profile, demoFb());
    items.forEach((p) => { RC[p.id] = p; });
    S.feed = { title: query ? `«${query}»` : 'Для тебя', items, total: items.length };
  }
}
async function loadOutfits() {
  try {
    const r = await Api.post('/api/outfits', { count: 3 });
    S.feedOutfits = r.outfits || [];
  } catch (e) {
    const ranked = Demo.rank(Demo.PRODUCTS, S.profile, demoFb());
    ranked.forEach((p) => { RC[p.id] = p; });
    S.feedOutfits = Demo.outfits(ranked, S.profile).map((o) => Object.assign({}, o, { items: o.items.map((id) => RC[id]).filter(Boolean), why: ['соответствует твоему стилю', 'подходит по цветам', 'укладывается в бюджет'] }));
  }
}
/* Дополни гардероб: топ вещей из категорий-пробелов. */
async function loadGaps() {
  S.gapItems = [];
  const gaps = (S.wardrobe.insights && S.wardrobe.insights.gaps) || [];
  if (!gaps.length || gaps.length >= 4) return;
  try {
    const r = await Api.post('/api/recommendations', { struct: {}, limit: 24 });
    (r.items || []).forEach((p) => { RC[p.id] = p; });
    S.gapItems = (r.items || []).filter((p) => gaps.includes(p.cat)).slice(0, 4);
  } catch (e) {
    const ranked = Demo.rank(Demo.PRODUCTS, S.profile, demoFb());
    ranked.forEach((p) => { RC[p.id] = p; });
    S.gapItems = ranked.filter((p) => gaps.includes(p.cat)).slice(0, 4);
  }
}

/* ---------- HOME: чат + лента ---------- */
function pickHtml(p) {
  return `<button class="pick" onclick="go('product',{id:'${p.id}'})">${IM(p.img, p.title)}<span class="pi"><b>${p.aiScore || ''}% · ${fmt(p.price)}</b><span>${esc(p.title)}</span></span></button>`;
}
function timeOf(t) {
  try { const d = new Date(t || Date.now()); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
  catch (e) { return ''; }
}
function msgHtml(m) {
  if (m.role === 'me') return `<div class="mrow me"><div class="m me">${m.img ? `<img class="methumb" src="${m.img}" alt="">` : ''}${esc(m.text)}</div></div>`;
  let inner = m.loading ? `<span class="ld"><i></i><i></i><i></i></span>` : esc(m.text);
  const live = (m.live || []).map((id) => RC[id]).filter(Boolean);
  if (live.length) {
    inner += `<div class="livelabel" style="margin-top:8px"><span class="livedot"></span>Живьём · Wildberries</div><div class="pickrow">${live.map(pickHtml).join('')}</div>`;
  }
  const valid = (m.picks || []).filter((id) => RC[id]);
  if (valid.length) {
    inner += `<div class="pickrow">${valid.map((id) => pickHtml(RC[id])).join('')}</div>`;
    inner += `<button class="link" style="padding:10px 0 0" onclick="feedFromChat('${m.id}')">Показать в ленте ${ic('chevR', 14)}</button>`;
  }
  if (m.outfit) {
    const o = m.outfit;
    inner += `<div class="minioutfit" onclick="openChatOutfit('${m.id}')"><div class="coll">${o.items.slice(0, 4).map((p) => IM(p.img, p.title)).join('')}</div><div class="t"><span>${esc(o.name)}</span><b>${o.score}% · ${fmt(o.total)}</b></div></div>`;
  }
  const acts = m.loading ? '' : `<div class="macts"><button onclick="copyMsg('${m.id}')">Копировать</button><button onclick="retryLast()">Ещё вариант</button><span class="time">${timeOf(m.t)}</span></div>`;
  return `<div class="mrow"><span class="ai-ava2">${spark(13)}</span><div style="min-width:0;max-width:88%"><div class="m ai">${inner}</div>${acts}</div></div>`;
}
window.copyMsg = function (id) {
  const m = (S.chat || []).find((x) => x.id === id);
  if (!m || !m.text) return;
  const done = () => toast('Скопировано');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(done, done);
  else done();
};
window.retryLast = function () {
  const me = [...S.chat].reverse().find((x) => x.role === 'me');
  if (me) askAI(me.text);
  else toast('Сначала спроси что-нибудь');
};
window.newChat = function () {
  S.chat = []; S.cid = 'c' + Date.now(); save(); render();
  toast('Новый диалог');
};
function vHome() {
  const p = S.profile;
  const w = S.ctx.weather;
  return `<div class="wrap">
    <div class="row"><div class="grow"><div class="hello" id="seasonline">${seasonText()}${w && w.city ? ` · ${esc(w.city)}` : ''}</div>
    <h1 class="title">Привет${p.name ? ', ' + esc(p.name) : ''}!</h1></div>
    ${S.photo ? `<img class="avatar" src="${S.photo}" onclick="go('profile')" alt="Профиль">` : `<button class="avatar" onclick="go('profile')">${esc((p.name || '?')[0])}</button>`}</div>

    <div id="offlinebar"></div>

    <div class="ai">
      <div class="ai-head"><span class="ai-ava2">${spark(13)}</span>sainvio ${S.aiModel ? `<span class="model">· ${esc(S.aiModel)}</span>` : ''}<button class="newchat" onclick="newChat()" aria-label="Новый диалог">${ic('plus', 16)}</button></div>
      <div class="msgs" id="msgs">
        ${!S.chat.length ? `<div class="mrow"><span class="ai-ava2">${spark(13)}</span><div class="m ai">Привет! Скажи, что ищем — подберу вещи и соберу образ. Например: «куртка на осень до 7000».</div></div>` : ''}
        ${S.chat.slice(-10).map(msgHtml).join('')}
      </div>
      ${!S.chat.length ? `<div class="qchips">${['Образ на осень', 'Чёрная куртка', 'Что-то минималистичное', 'Собери образ', 'Белые кроссовки', 'Брюки до 3000'].map((q) => `<button onclick="ask('${esc(q)}')">${q}</button>`).join('')}</div>`
      : `<div class="qchips">${['Собери образ', 'Покажи дешевле', 'Другой стиль', 'В стиле old money', 'Что надеть осенью', 'Чёрные брюки', 'Белые кроссовки'].map((q) => `<button onclick="ask('${esc(q)}')">${q}</button>`).join('')}</div>`}
      ${CHAT_IMG ? `<div class="chatprev"><img src="${CHAT_IMG}" alt="Прикреплённое фото"><button onclick="chatImgClear()" aria-label="Убрать фото">${ic('x', 14)}</button></div>` : ''}
      <div class="aibar"><button class="plusbtn" onclick="chatPhoto()" aria-label="Прикрепить фото">${ic('plus', 20)}</button><textarea id="ainput" rows="1" placeholder="Что подобрать?" autocomplete="off" oninput="autoGrow(this)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"></textarea><button onclick="send()" aria-label="Отправить">${ic('send', 18)}</button></div>
    </div>

    <div class="sect"><h2>${esc(S.feed.title)}</h2>${S.feed.total ? `<span>${S.feed.total}</span>` : ''}</div>
    ${S.feed.items.length ? `<div class="feed">${S.feed.items.slice(0, 6).map((x, i) => cardHtml(x, i)).join('')}</div>`
      : `<div class="empty"><h3>Пока пусто</h3><p class="small">Спроси что-нибудь выше — лента соберётся под запрос.</p></div>`}

    <div class="sect"><h2>Образы</h2><button class="link" onclick="go('outfits')">Все ${ic('chevR', 13)}</button></div>
    <div id="ohome">${S.feedOutfits.length ? outfitCard(S.feedOutfits[0]) : `<button class="btn secondary" onclick="makeOutfits()">Собрать образы</button>`}</div>

    ${S.gapItems.length ? `<div class="sect"><h2>Дополни гардероб</h2><span>этого не хватает</span></div>
    <div class="feed">${S.gapItems.map((x, i) => cardHtml(x, i)).join('')}</div>` : ''}

    <div style="height:8px"></div>
  </div>`;
}
function cardHtml(p, i) {
  const fav = S.favorites.includes(p.id);
  const rc = p.reviews >= 1000 ? (p.reviews / 1000).toFixed(1).replace('.', ',') + 'k' : (p.reviews || 0);
  return `<button class="card" onclick="go('product',{id:'${p.id}'})">
    <span class="ph">${IM(p.img, p.title)}
    <span class="fav ${fav ? 'on' : ''}" onclick="event.stopPropagation();fav('${p.id}')" role="button" aria-label="В избранное">${ic('heart', 16)}</span></span>
    <span class="ct">${esc(p.title)}</span><span class="pr">${fmt(p.price)}<s>${fmt(p.old)}</s></span>
    <span class="mt2">${p.mp === 'WB' ? 'WB' : 'Ozon'} · ★ ${p.rating || '—'} · ${rc}</span>
    ${p.live ? `<span class="mt live"><span class="livedot"></span>Live · ${p.aiScore}% · WB</span>` : `<span class="mt">${p.aiScore}% тебе подходит</span>`}</button>`;
}
function outfitCard(o) {
  return `<button class="ocard" onclick="go('outfit',{id:'${o.id}'})">
    <span class="coll">${o.items.slice(0, 4).map((p) => IM(p.img, p.title)).join('')}</span>
    <span class="inf"><span class="bt">${esc(o.name)}</span><span class="meta"><strong>${o.score}%</strong> · ${fmt(o.total)} · ${o.items.length} вещи</span></span></button>`;
}
function scrollMsgs() { setTimeout(() => { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; }, 80); }

/* Расширение-человек: печатает запрос в WB (~10-15с) и отдаёт до 30 свежих.
   Нет расширения — тихий [] по таймауту. */
window.__extBridge = false; window.__extHintShown = false;
window.addEventListener('message', (e) => {
  if (e && e.source === window && e.data && e.data.src === 'sainvio-ext' && e.data.hello) window.__extBridge = true;
});
function extLiveQuery(query) {
  if (!window.__extBridge) {
    if (!window.__extHintShown) {
      window.__extHintShown = true;
      try { toast('Живьё: обнови расширение и страницу'); } catch (e) {}
    }
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    const reqId = 'q' + Date.now().toString(36);
    let to = null, done = false;
    const over = (v) => { if (!done) { done = true; if (to) clearTimeout(to); window.removeEventListener('message', h); resolve(v); } };
    function h(e) {
      if (!e || e.source !== window || !e.data || e.data.src !== 'sainvio-ext' || e.data.reqId !== reqId) return;
      const items = e.data.busy ? [] : (e.data.items || []);
      if (items.length) { try { toast('Расширение: свежих ' + items.length); } catch (te) {} }
      over(items);
    }
    to = setTimeout(() => over([]), 50000);
    window.addEventListener('message', h);
    try { window.postMessage({ src: 'sainvio-web', want: 'liveQuery', query: String(query || '').slice(0, 60), reqId }, '*'); }
    catch (e) { over([]); }
  });
}
/* чат: вопрос → backend → ответ встраивается в главную */
window.ask = function (t) { askAI(t); };
window.send = function () { const i = $('#ainput'); if (i) { askAI(i.value); i.value = ''; autoGrow(i); } };
window.autoGrow = function (el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; };
let __asking = false;
let CHAT_IMG = null;
window.chatPhoto = function () {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f || !f.type.startsWith('image/')) return;
    if (!S.photoConsent && !confirm('Фото вещи будет отправлено AI-провайдеру для поиска похожих. Продолжить?')) return;
    S.photoConsent = true; save();
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const k = Math.min(1, 768 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          CHAT_IMG = c.toDataURL('image/jpeg', 0.8);
        } catch (e) { CHAT_IMG = r.result; }
        if (CHAT_IMG && CHAT_IMG.length > 1100000) { CHAT_IMG = null; toast('Фото слишком большое'); }
        render();
      };
      img.onerror = () => { toast('Не получилось прочитать фото'); };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };
  inp.click();
};
window.chatImgClear = function () { CHAT_IMG = null; render(); };
function shortModel(m) {
  if (!m) return '';
  const base = String(m).split('/').pop().split(':')[0];
  return base.replace(/-/g, ' ').slice(0, 24);
}
async function askAI(text, img) {
  text = (text || '').trim();
  img = img || CHAT_IMG;
  if ((!text && !img) || __asking) return;
  if (!Api.ok && img) { toast('Фото ищет только онлайн с подключённым AI'); return; }
  __asking = true;
  /* Свежая полоса стартует ПАРАЛЛЕЛЬНО серверу: пока AI думает, расширение печатает запрос в WB. */
  const extP = extLiveQuery(text);
  if (S.route !== 'home') go('home');
  S.cid = S.cid || ('c' + Date.now());
  const lastMe = [...S.chat].reverse().find((x) => x.role === 'me');
  if (!lastMe || lastMe.text !== text || (img && lastMe.img !== img)) S.chat.push({ role: 'me', text: text || 'Найди похожие', img: img || null, id: 'm' + Date.now() + 'u', t: Date.now() });
  CHAT_IMG = null;
  const mid = 'm' + Date.now();
  S.chat.push({ role: 'ai', text: '', loading: true, id: mid, t: Date.now() });
  save(); render();
  const fin = (patch) => {
    S.chat = S.chat.map((m) => m.id === mid ? Object.assign(m, patch, { loading: false, t: Date.now() }) : m);
    if (patch.outfit) RC['chatfit'] = patch.outfit;
    if (patch.model) S.aiModel = shortModel(patch.model);
    S.lastResult = { query: text, queryImg: img || null, message: patch.text || '', picks: patch.allPicks || patch.picks || [], live: patch.live || [], outfit: patch.outfit || null, total: patch.total || 0, ok: !patch.error };
    save(); __asking = false;
    go('results');
  };
  try {
    /* Лайв-режим: сервер до 12с ждёт WB + Takprodam + AI — даём 45с, иначе оборвём рабочий запрос. */
    const r = await Api.post('/api/ai/chat', { message: text, conversationId: S.cid, image: img || null }, 45000);
    const d = r.data || {};
    S.cid = d.conversationId || S.cid;
    (d.products || []).forEach((p) => { RC[p.id] = p; });
    const patch = { text: d.message || 'Готово.', picks: (d.products || []).slice(0, 6).map((p) => p.id), allPicks: (d.products || []).slice(0, 50).map((p) => p.id), total: d.total || 0, model: d.model || d.aiMode };
    if (/образ/i.test(text)) {
      try {
        const o = await Api.post('/api/outfits', { count: 1 });
        if (o.outfits && o.outfits[0]) patch.outfit = o.outfits[0];
      } catch (e) {}
    }
    /* Живьём с WB: прямой запрос из браузера + скоринг тем же движком.
       Для фото используем suggestQuery от вижена, а не текст кнопки. */
    try {
      const raw = await WBClient.searchText(d.suggestQuery || text, 50);
      if (raw.length) {
        const s = await Api.post('/api/market/score', { items: raw, struct: {} });
        (s.items || []).forEach((p) => { RC[p.id] = p; });
        patch.live = (s.items || []).slice(0, 10).map((p) => p.id);
      } else patch.liveBlocked = true;
    } catch (e) { patch.liveBlocked = true; }
    /* Свежая полоса от расширения-человека: до 30 под этот запрос — в живьё. */
    try {
      const ex = await Promise.race([extP, new Promise((res) => setTimeout(() => res([]), 45000))]);
      if (ex.length) {
        const mergeLive = (ids) => {
          patch.live = patch.live || [];
          const seenL = new Set(patch.live);
          ids.forEach((id) => { if (RC[id] && !seenL.has(id)) { seenL.add(id); patch.live.push(id); } });
          patch.live = patch.live.slice(0, 12);
        };
        try {
          const s = await Api.post('/api/market/score', { items: ex.slice(0, 30), struct: {} });
          (s.items || []).forEach((p) => { RC[p.id] = p; });
          mergeLive((s.items || []).map((p) => p.id));
        } catch (se) {
          const fb2 = demoFb();
          ex.slice(0, 30).forEach((p) => { try { const rr = Demo.score(p, S.profile, fb2); RC[p.id] = Object.assign({}, p, { aiScore: rr.score, aiParts: rr.parts }); } catch (ee) {} });
          mergeLive(ex.slice(0, 30).map((p) => p.id));
        }
      }
    } catch (e) {}
    fin(patch);
  } catch (e) {
    /* Нет backend (статический хостинг): локальный демо-мозг + живьём с WB. */
    try {
      const b = Demo.brain(text, S.profile);
      b.items.forEach((p) => { RC[p.id] = p; });
      const demoPatch = { text: b.message, picks: b.ids.slice(0, 6), allPicks: b.ids, total: b.total };
      if (/образ/i.test(text)) {
        const ranked = Demo.rank(Demo.PRODUCTS, S.profile, demoFb());
        const o = Demo.outfits(ranked, S.profile)[0];
        if (o) { o.items = o.items.map((id) => RC[id]).filter(Boolean); RC['chatfit'] = o; demoPatch.outfit = o; }
      }
      /* На статике живьё с WB тоже работает (CORS открыт) — score считаем
         локально тем же движком, метка Live сохраняется. */
      try {
        const raw = await WBClient.searchText(text, 50);
        const fb = demoFb();
        const scored = [];
        raw.forEach((p) => { try { const r = Demo.score(p, S.profile, fb); scored.push(Object.assign({}, p, { aiScore: r.score, aiParts: r.parts })); } catch (se) {} });
        scored.sort((a, b) => b.aiScore - a.aiScore);
        scored.forEach((p) => { RC[p.id] = p; });
        if (scored.length) demoPatch.live = scored.slice(0, 10).map((p) => p.id);
        else demoPatch.liveBlocked = true;
      } catch (we) { demoPatch.liveBlocked = true; }
      fin(demoPatch);
    } catch (de) {
      fin({ text: 'Не получилось связаться с AI. Проверь соединение и попробуй ещё раз.', error: true });
    }
  }
}
window.feedFromChat = function (mid) {
  const m = S.chat.find((x) => x.id === mid);
  if (!m || !m.picks) return;
  const items = m.picks.map((id) => RC[id]).filter(Boolean);
  S.feed = { title: 'Из диалога', items, total: items.length };
  save(); render();
  setTimeout(() => toast('Лента обновлена'), 100);
};
window.openChatOutfit = function (mid) {
  const m = S.chat.find((x) => x.id === mid);
  if (m && m.outfit) { RC['chatfit'] = m.outfit; go('outfit', { id: 'chatfit' }); }
};
window.makeOutfits = async function () { await loadOutfits(); render(); };

/* ---------- results: ответ AI отдельной страницей ---------- */
function vResults() {
  const r = S.lastResult;
  if (!r) return `<div class="wrap"><div class="empty"><h3>Пока нет ответа</h3><button class="btn secondary" onclick="go('home')">Домой</button></div></div>`;
  const items = (r.picks || []).map((id) => RC[id]).filter(Boolean);
  const live = (r.live || []).map((id) => RC[id]).filter(Boolean);
  return `<div class="wrap">
    <div class="row"><button class="iconbtn" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button>
    <div class="grow"><span class="small muted">Запрос · ${esc(r.query || '')}</span></div></div>
    <div class="answer"><span class="ai-ava light">${ic('spark', 15)}</span><div>${r.queryImg ? `<img class="qthumb" src="${r.queryImg}" alt="">` : ''}<p>${esc(r.message)}</p></div></div>
    ${r.outfit ? `<div class="sect"><h2>Готовый образ</h2></div>${outfitCard(r.outfit)}` : ''}
    ${live.length ? `<div class="sect"><h2>Живьём · WB</h2><span>реальные цены</span></div>
    <div class="feed">${live.map((x, i) => cardHtml(x, i)).join('')}</div>` : ''}
    ${items.length ? `<div class="sect"><h2>Лучшее для тебя</h2>${r.total ? `<span>${r.total}</span>` : ''}</div>
    <div class="feed">${items.map((x, i) => cardHtml(x, i)).join('')}</div>` : ''}
    ${!items.length && !live.length && !r.outfit && r.ok ? `<div class="empty"><h3>Смотрим живьём</h3><p class="small">AI собрал запрос — открываем настоящий поиск маркетплейса в новой вкладке.</p>
    <div style="display:grid;gap:8px;margin-top:14px"><button class="btn" onclick="openSearch('WB')">Искать «${esc((r.query || 'одежда').slice(0, 32))}» на WB</button>
    <button class="btn secondary" onclick="openSearch('OZON')">Тот же запрос на Ozon</button></div></div>` : ''}
    <div style="height:150px"></div>
    ${(items.length || live.length) ? `<div class="cta"><button class="btn" onclick="feedFromResult()">${ic('check', 16)} В ленту на главной</button></div>` : ''}
  </div>`;
}
window.openSearch = function (mp) {
  const r = S.lastResult;
  const q = encodeURIComponent(((r && r.query) || 'одежда').slice(0, 60));
  const url = mp === 'OZON' ? `https://www.ozon.ru/search/?text=${q}` : `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`;
  window.open(url, '_blank');
  toast(mp === 'OZON' ? 'Открываем поиск Ozon' : 'Открываем поиск WB');
};
window.feedFromResult = function () {
  const r = S.lastResult; if (!r) return;
  const items = ((r.live || []).concat(r.picks || [])).map((id) => RC[id]).filter(Boolean);
  S.feed = { title: `«${r.query}»`, items, total: r.total || items.length };
  save(); go('home');
  setTimeout(() => toast('Лента обновлена'), 100);
};

/* ---------- product ---------- */
function vProduct(id) {
  return `<div class="wrap"><div id="pbody"><div class="empty"><p class="small">Загружаем…</p></div></div></div>`;
}
window.__loadProduct = async function (id) {
  const cached = RC[id];
  if (cached && cached.live) { renderLiveProduct(cached); return; }
  try {
    const [pr, rv] = await Promise.all([
      Api.get('/api/products/' + id),
      Api.get('/api/products/' + id + '/reviews').catch(() => null)
    ]);
    const p = pr.product; RC[p.id] = p;
    renderDemoProduct(p, rv, id);
  } catch (e) {
    const base = Demo.find(id);
    if (base) {
      const ranked = Demo.rank([Object.assign({}, base)], S.profile, demoFb())[0];
      RC[id] = ranked;
      renderDemoProduct(ranked, { data: { count: 800 + (id.charCodeAt(1) * 37) % 4000, reviews: Demo.REVIEWS[ranked.cat] || [] } }, id);
      return;
    }
    const el = document.getElementById('pbody');
    if (el) el.innerHTML = `<div class="empty"><h3>Не открылось</h3><p class="small">Проверь соединение.</p><button class="btn secondary" onclick="__loadProduct('${id}')">Повторить</button></div>`;
  }
};
function renderDemoProduct(p, rv, id) {
    const fav = S.favorites.includes(p.id);
    const need = p.cat === 'shoes' ? S.profile.shoeSize : p.cat === 'bottom' ? S.profile.pantsSize : S.profile.topSize;
    const an = p.aiParts || {};
    const rows = [
      ['Стиль', an.style, 'Соответствует твоему профилю.'],
      ['Посадка', an.body, `Фасон «${p.fit}» может подойти под твои пропорции.`],
      ['Цена', an.budget, p.price <= S.profile.budget ? 'В пределах бюджета.' : 'Выше бюджета, но оценка высокая.'],
      ['Качество', an.quality, 'Состав и сигналы из отзывов.']
    ];
    const el = document.getElementById('pbody');
    if (!el || S.route !== 'product') return;
    el.innerHTML = `
      <div class="gal" style="margin:14px -20px 0;position:relative">${IM(p.img, p.title)}
        <button class="iconbtn l" style="position:absolute;top:14px;left:14px" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button></div>
      <div class="row" style="margin-top:14px"><div class="grow"><span class="small muted">${p.mp === 'WB' ? 'Wildberries' : 'Ozon'} · ${ic('star', 12)} ${p.rating}</span></div>
      <button class="iconbtn favbtn ${fav ? 'on' : ''}" onclick="fav('${p.id}')" aria-label="В избранное" style="${fav ? 'color:#E11D48' : ''}">${ic('heart', 19)}</button>
      <button class="iconbtn" onclick="shareProduct('${p.id}')" aria-label="Поделиться" style="margin-left:8px">${ic('share', 18)}</button></div>
      <h1 style="font-size:21px;margin-top:6px">${esc(p.title)}</h1>
      <div class="price">${fmt(p.price)}<s>${fmt(p.old)}</s></div>
      <p class="sub">${esc(p.desc || '')}</p>
      ${p.dataset ? `<p class="sub" style="font-size:12px">Открытые данные WB (дек 2024): цена и наличие могли измениться — проверь на странице товара.</p>` : ''}
      ${p.legalText ? `<p class="sub" style="font-size:11.5px">Реклама · ${esc(p.legalText)}</p>` : ''}
      <div class="field"><label>Размер · твой ${esc(need)}</label></div>
      <div class="sizes">${p.sizes.map((s) => `<button class="size ${String(s) === String(need) ? 'on' : ''}">${s}</button>`).join('')}</div>
      <div class="note"><b>${p.aiScore}% тебе подходит.</b> Почему — ниже.</div>
      <div class="why">${rows.map(([t, v, d]) => `<div class="whyrow"><div><b>${t}</b><span>${d}</span></div><span class="n">${v == null ? '—' : v}</span></div>`).join('')}</div>
      ${rv && rv.data ? `<div class="field"><label>Отзывы · ${rv.data.count}</label></div><p class="sub">Часто хвалят: ${(rv.data.reviews || []).filter((r) => r.rating >= 5).slice(0, 2).map((r) => esc(r.text.split('.')[0].toLowerCase())).join('; ') || '—'}.</p>` : ''}
      <div style="height:170px"></div>
      <div class="cta"><button class="btn" onclick="market('${p.id}')">Открыть в магазине ${ic('upRight', 16)}</button>
      <button class="btn secondary" onclick="dislike('${p.id}')">Не моё</button></div>`;
    el.querySelectorAll('.size').forEach((b) => b.onclick = () => { el.querySelectorAll('.size').forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
}
/* Живой товар WB: рендерим из кеша, отзывы не выдумываем. */
function renderLiveProduct(p) {
  const el = document.getElementById('pbody');
  if (!el || S.route !== 'product') return;
  const fav = S.favorites.includes(p.id);
  const an = p.aiParts || {};
  const rows = [
    ['Стиль', an.style, 'Соответствует твоему профилю.'],
    ['Посадка', an.body, 'Ориентируемся на указанный размер.'],
    ['Цена', an.budget, 'Живая цена Wildberries на момент поиска.'],
    ['Рейтинг', an.quality, p.reviews ? `На WB: ${p.rating} · ${Number(p.reviews).toLocaleString('ru-RU')} оценок.` : 'Рейтинг WB.']
  ];
  el.innerHTML = `
    <div class="gal" style="margin:14px -20px 0;position:relative">${IM(p.img, p.title)}
      <button class="iconbtn l" style="position:absolute;top:14px;left:14px" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button></div>
    <div class="row" style="margin-top:14px"><div class="grow"><span class="livelabel"><span class="livedot"></span>Live · Wildberries</span></div>
    <button class="iconbtn ${fav ? 'on' : ''}" onclick="fav('${p.id}')" aria-label="В избранное" style="${fav ? 'color:#E11D48' : ''}">${ic('heart', 19)}</button></div>
    <h1 style="font-size:21px;margin-top:6px">${esc(p.title)}</h1>
    <div class="price">${fmt(p.price)}<s>${fmt(p.old)}</s></div>
    <p class="sub">${esc(p.brand || '')} · размеры на WB: <b style="color:var(--ink)">${(p.sizes || []).slice(0, 6).join(', ')}</b></p>
    ${p.nmId ? `<button class="link" style="padding:4px 0" onclick="copyArt('${p.nmId}')">Артикул WB: <b>${p.nmId}</b> · копировать</button>` : ''}
    <div class="note"><b>${p.aiScore}% тебе подходит.</b> Живые данные WB — цена и наличие на момент поиска.</div>
    <div class="why">${rows.map(([t, v, d]) => `<div class="whyrow"><div><b>${t}</b><span>${d}</span></div><span class="n">${v == null ? '—' : v}</span></div>`).join('')}</div>
    <p class="sub">Отзывы и точное наличие — на странице товара в магазине, мы их не копируем.</p>
    <div style="height:150px"></div>
    <div class="cta"><button class="btn" onclick="market('${p.id}')">Купить на Wildberries ${ic('upRight', 16)}</button></div>`;
}
function shareUrl(p) {
  if (p.live && p.url) return p.url;
  const q = encodeURIComponent(p.title);
  return p.mp === 'WB' ? `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}` : `https://www.ozon.ru/search/?text=${q}`;
}
window.shareProduct = async function (id) {
  const p = RC[id]; if (!p) return;
  const data = { title: p.title, text: `${p.title} — ${fmt(p.price)}`, url: shareUrl(p) };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    throw new Error('no share');
  } catch (e) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
      toast('Ссылка скопирована');
    } catch (ce) { toast('Не получилось поделиться'); }
  }
};
window.copyArt = async function (nmId) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(String(nmId));
    toast('Артикул скопирован — вставь в поиск WB');
  } catch (e) { toast('Артикул: ' + nmId); }
};
window.shareOutfit = async function (id) {  const o = findOutfit(id); if (!o) return;
  const items = (o.items || []).map((x) => (typeof x === 'string' ? RC[x] : x)).filter(Boolean);
  const text = `${o.name} (${fmt(o.total)}):\n` + items.map((p) => `• ${p.title} — ${shareUrl(p)}`).join('\n');
  try {
    if (navigator.share) { await navigator.share({ title: o.name, text }); return; }
    throw new Error('no share');
  } catch (e) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
      toast('Образ скопирован');
    } catch (ce) { toast('Не получилось поделиться'); }
  }
};
window.market = async function (id) {
  const p = RC[id]; if (!p) return;
  if (p.trackingUrl) { window.open(p.trackingUrl, '_blank'); toast('Открываем магазин по партнёрской ссылке'); return; }
  let raw;
  if (p.url) raw = p.url;
  else {
    const q = encodeURIComponent(p.title);
    raw = p.mp === 'WB' ? `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}` : `https://www.ozon.ru/search/?text=${q}`;
  }
  try {
    const r = await Api.get('/api/market/link?mp=' + p.mp + '&u=' + encodeURIComponent(raw));
    window.open(r.data.url, '_blank');
    toast(r.data.affiliate ? 'Открываем магазин (партнёрская ссылка)' : (p.live ? 'Открываем реальную карточку' : (p.dataset ? 'Открываем карточку WB' : 'Открываем поиск в магазине')));
  } catch (e) {
    window.open(raw, '_blank');
    toast(p.live || p.dataset ? 'Открываем реальную карточку' : 'Открываем поиск в магазине');
  }
};
window.fav = async function (id) {
  const i = S.favorites.indexOf(id);
  if (i >= 0) S.favorites.splice(i, 1);
  else { S.favorites.push(id); toast('Сохранено — учтём в подборках'); }
  save(); render();
  try {
    if (i >= 0) await Api.post('/api/favorites', { action: 'remove', productId: id });
    else { await Api.post('/api/favorites', { productId: id }); await Api.post('/api/feedback', { productId: id, kind: 'like' }); }
  } catch (e) { /* локально уже сохранено */ }
};
window.dislike = async function (id) {
  try { await Api.post('/api/feedback', { productId: id, kind: 'dislike', reason: 'Не мой стиль' }); } catch (e) {}
  S.favorites = S.favorites.filter((x) => x !== id);
  save(); render(); toast('Поняли, покажем меньше похожего');
};

/* ---------- outfits ---------- */
function findOutfit(id) {
  if (RC[id] && RC[id].items) return RC[id];
  const s = S.savedOutfits.find((o) => o.id === id);
  if (s) return s;
  return (S.feedOutfits || []).find((o) => o.id === id);
}
function vOutfits() {
  const list = S.savedOutfits.concat(S.feedOutfits);
  return `<div class="wrap"><h1 class="title">Образы</h1><p class="sub">Готовые комплекты под твой профиль.</p>
    <div style="height:12px"></div><button class="btn secondary" onclick="buildNew()">${ic('plus', 16)} Собрать новые</button>
    <div style="display:grid;gap:12px;margin-top:14px">${list.map(outfitCard).join('') || '<div class="empty"><h3>Пока нет образов</h3></div>'}</div>
    <div style="height:20px"></div></div>`;
}
window.buildNew = async function () {
  toast('Собираем…'); await loadOutfits(); render();
};
function vOutfit(id) {
  const o = findOutfit(id);
  if (!o) return `<div class="wrap"><div class="empty"><h3>Образ не найден</h3><button class="btn secondary" onclick="go('home')">Домой</button></div></div>`;
  const items = o.items || [];
  const saved = S.savedOutfits.some((x) => x.id === o.id);
  return `<div class="wrap"><div class="row"><button class="iconbtn" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button></div>
    <h1 class="title" style="margin-top:12px">${esc(o.name)}</h1>
    <p class="sub"><b style="color:var(--green)">${o.score}%</b> тебе подходит · ${fmt(o.total)}</p>
    <div class="ocollage" style="margin-top:14px">${items.map((p) => IM(p.img, p.title)).join('')}</div>
    <div style="margin-top:6px">${items.map((p) => `<div class="kv"><span>${esc(p.title)}</span><b>${fmt(p.price)}</b></div>`).join('')}</div>
    <div style="height:150px"></div>
    <div class="cta">${saved ? `<button class="btn secondary" onclick="go('outfits')">Уже сохранён</button>` : `<button class="btn" onclick="keepOutfit('${o.id}')">${ic('check', 16)} Сохранить образ</button>`}<button class="btn secondary" onclick="shareOutfit('${o.id}')">${ic('share', 16)} Поделиться</button></div></div>`;
}
window.keepOutfit = function (id) {
  const o = findOutfit(id); if (!o) return;
  if (!S.savedOutfits.some((x) => x.id === id)) S.savedOutfits.unshift(o);
  save(); toast('Образ сохранён'); go('outfits');
};

/* ---------- wardrobe ---------- */
const CDOT = { black: '#171717', white: '#FFFFFF', olive: '#6B7C3A', beige: '#D9C7A7', gray: '#9AA0A3', green: '#134E3A', blue: '#3B5BDB', brown: '#7A5230' };
const CNAMES = { black: 'Чёрный', white: 'Белый', olive: 'Олива', beige: 'Бежевый', gray: 'Серый', green: 'Зелёный', blue: 'Синий', brown: 'Коричневый' };
const CATS = [['top', 'Верх'], ['bottom', 'Низ'], ['shoes', 'Обувь'], ['acc', 'Аксессуары']];
let WF = { title: '', cat: 'top', colors: [], styles: [], photo: null };
async function loadWardrobe() {
  try {
    const r = await Api.get('/api/wardrobe');
    S.wardrobe = { items: r.items || [], insights: r.insights || null };
  } catch (e) {
    try {
      const raw = localStorage.getItem(LS_W) || localStorage.getItem(LS_W_LEGACY);
      const items = raw ? JSON.parse(raw) : [];
      S.wardrobe = { items, insights: Demo.insights(items) };
    } catch (de) { S.wardrobe = { items: [], insights: null }; }
  }
}
function saveWardrobeLocal() {
  try { localStorage.setItem(LS_W, JSON.stringify(S.wardrobe.items)); } catch (e) {}
}
function dot(c) { return `<span class="cdot" style="background:${CDOT[c] || '#ccc'}"></span>`; }
function vWardrobe() {
  const w = S.wardrobe, ins = w.insights;
  return `<div class="wrap">
    <div class="row"><button class="iconbtn" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button>
    <div class="grow"><h1 class="title" style="font-size:24px">Мой гардероб</h1></div></div>
    ${ins && ins.count ? `<div class="note"><b>Что видит AI.</b> ${esc(ins.note)}<div class="row" style="margin-top:10px;gap:6px">${ins.colors.map(dot).join('')}<span class="small muted" style="margin-left:4px">${ins.styles.map((s) => (STYLES.find(([k]) => k === s) || [])[1] || s).join(' · ')}</span></div></div>`
    : `<div class="note">Добавь 3–5 любимых вещей — AI поймёт твой вкус, и лента станет точнее. Учитываются цвета, стили и пробелы.</div>`}
    <div class="field"><label>Новая вещь</label></div>
    <div class="wrow">
      <label class="wphoto">${WF.photo ? `<img src="${WF.photo}" alt="">` : ic('camera', 22)}<input type="file" accept="image/*" hidden onchange="wPhoto(event)"></label>
      <input class="input grow" id="w_title" placeholder="Например: чёрное худи" value="${esc(WF.title)}" oninput="WF.title=this.value">
    </div>
    <div class="chips">${CATS.map(([k, t]) => `<button class="chip ${WF.cat === k ? 'on' : ''}" onclick="wCat('${k}')">${t}</button>`).join('')}</div>
    <div class="field"><label>Цвета (до 2)</label></div>
    <div class="chips">${Object.keys(CDOT).map((c) => `<button class="chip ${WF.colors.includes(c) ? 'on' : ''}" onclick="wCol('${c}')">${dot(c)}${CNAMES[c]}</button>`).join('')}</div>
    <div class="field"><label>Стили (необязательно)</label></div>
    <div class="chips">${STYLES.map(([k, t]) => `<button class="chip ${WF.styles.includes(k) ? 'on' : ''}" onclick="wSty('${k}')">${t}</button>`).join('')}</div>
    <div style="height:12px"></div>
    <button class="btn secondary" onclick="wAdd()">${ic('plus', 16)} Добавить в гардероб</button>
    <div class="sect"><h2>Вещи · ${w.items.length}</h2></div>
    ${w.items.length ? w.items.map((it) => `<div class="kv"><span class="witem">${it.photo ? `<img class="wthumb" src="${it.photo}" alt="">` : dot((it.colors || [])[0] || 'gray')} <span><b>${esc(it.title)}</b><br><span class="small muted">${(CATS.find(([k]) => k === it.cat) || [])[1] || ''}${(it.styles || []).length ? ' · ' + it.styles.map((s) => (STYLES.find(([k]) => k === s) || [])[1] || s).join(', ') : ''}</span></span></span><button class="iconbtn" style="width:40px;height:40px" onclick="wDel('${it.id}')" aria-label="Убрать">${ic('trash', 16)}</button></div>`).join('')
    : `<div class="empty"><h3>Пока пусто</h3><p class="small">Форма выше — добавь первую вещь.</p></div>`}
    <div style="height:20px"></div></div>`;
}
window.wCat = function (c) { WF.cat = c; render(); };
window.wCol = function (c) { const i = WF.colors.indexOf(c); if (i >= 0) WF.colors.splice(i, 1); else if (WF.colors.length < 2) WF.colors.push(c); render(); };
window.wSty = function (s) { const i = WF.styles.indexOf(s); if (i >= 0) WF.styles.splice(i, 1); else if (WF.styles.length < 3) WF.styles.push(s); render(); };
window.wPhoto = function (e) {
  const f = e.target.files && e.target.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        WF.photo = c.toDataURL('image/jpeg', 0.75);
      } catch (err) { WF.photo = r.result; }
      if (WF.photo && WF.photo.length > 550000) { WF.photo = null; toast('Фото слишком большое — выбери другое'); }
      render();
    };
    img.onerror = () => { WF.photo = null; render(); };
    img.src = r.result;
  };
  r.readAsDataURL(f);
};
window.wAdd = async function () {
  const title = (WF.title || '').trim();
  if (!title) { toast('Сначала назови вещь'); return; }
  const item = { id: 'w' + Date.now(), title, cat: WF.cat, colors: WF.colors.slice(), styles: WF.styles.slice(), photo: WF.photo, addedAt: Date.now() };
  try {
    const r = await Api.post('/api/wardrobe', { item: { title, cat: WF.cat, colors: WF.colors, styles: WF.styles, photo: WF.photo } });
    WF = { title: '', cat: 'top', colors: [], styles: [], photo: null };
    S.wardrobe = { items: [r.item].concat(S.wardrobe.items), insights: r.insights };
  } catch (e) {
    WF = { title: '', cat: 'top', colors: [], styles: [], photo: null };
    S.wardrobe.items.unshift(item);
    S.wardrobe.insights = Demo.insights(S.wardrobe.items);
    saveWardrobeLocal();
  }
  S._fed = false; S.gapItems = [];
  save(); render();
  toast('Добавлено — вкус обновлён');
};
window.wDel = async function (id) {
  S.wardrobe.items = S.wardrobe.items.filter((x) => x.id !== id);
  S.wardrobe.insights = Demo.insights(S.wardrobe.items);
  saveWardrobeLocal(); S._fed = false; S.gapItems = []; save(); render();
  try {
    const r = await Api.req('/api/wardrobe', { method: 'DELETE', body: JSON.stringify({ id }) });
    S.wardrobe.insights = r.insights || S.wardrobe.insights; render();
  } catch (e) { /* локально уже удалено */ }
};

/* ---------- privacy ---------- */
window.privBack = function () { go(S.token ? 'profile' : 'auth'); };
function vPrivacy() {
  const op = OPERATOR;
  const li = (t, d) => `<div class="kv"><span>${t}</span></div><p class="sub">${d}</p>`;
  return `<div class="wrap">
    <div class="row"><button class="iconbtn" onclick="privBack()" aria-label="Назад">${ic('back', 19)}</button>
    <div class="grow"><h1 class="title" style="font-size:24px">Политика конфиденциальности</h1></div></div>
    <p class="sub">sainvio — ${esc(op.name)}, ИНН ${esc(op.inn)}, ${esc(op.address)}, контакт для вопросов по данным: ${esc(op.email)}. Это краткая политика по 152-ФЗ. Полный текст и реквизиты уточняй у оператора до запуска.</p>
    ${li('1. Какие данные', 'Логин и пароль (хеш), имя, рост, вес, пол, телосложение, размеры, стили, бюджет, цвета; фото; гардероб, избранное, история чата и подборок; технические cookie и localStorage.')}
    ${li('2. Зачем', 'Подбор вещей и образов, анализ фото, ведение аккаунта и гардероба. Основания: твоё согласие и договор (условия использования). Без данных подборки не работают.')}
    ${li('3. Фото и биометрия', 'Фото лица — биометрические данные (ст.11 152-ФЗ). Обрабатываем только с отдельной галочки, отправляем AI-провайдеру один раз для анализа и кешируем результат. Без галочки фото никуда не уходит.')}
    ${li('4. Кому передаём', 'Хостинг и база (сейчас иностранные — см. п.5), AI-провайдеры анализа фото и диалога, Wildberries/Ozon — только когда переходишь по ссылке (там их правила). Данные не продаём, рекламных трекеров нет.')}
    ${li('5. Где хранится', 'Сейчас сервер и база могут быть за пределами РФ. Для запуска в РФ первичную базу граждан РФ перенесём на серверы в России, а о трансграничной передаче уведомим Роскомнадзор.')}
    ${li('6. Сколько храним', 'Пока пользуешься аккаунтом. Удаление: Профиль → «Удалить мои данные» стирает серверные данные; локальные чистятся вместе с ними. По закону можем хранить то, что обязаны (например, для ответов на споры).')}
    ${li('7. Твои права', 'Доступ, уточнение, блокирование, удаление, отзыв согласия через «Удалить мои данные» или письмом на ' + esc(op.email) + '. Ответим в сроки по 152-ФЗ.')}
    ${li('8. Cookie', 'Только функциональные: вход, подборки, выбор баннера. Кнопка «Только необходимые» отключает всё необязательное. Запретить можно и в браузере — часть функций пропадёт.')}
    ${li('9. AI-рекомендации', 'Проценты и образы считает код + AI по твоему профилю. Это предположение стилиста, а не гарантия качества, размера или наличия. Живые цены WB могут меняться — проверяй на карточке.')}
    ${li('10. Партнёрские ссылки', 'Часть ссылок на магазины может быть партнёрской (вознаграждение сервиса, цена для тебя не меняется). Такие размещения маркируются по 38-ФЗ: пометка «Реклама», рекламодатель и erid.')}
    ${li('11. Безопасность', 'Пароли — только хеши, сессии ограниченные, лимиты запросов, HTTPS. Об утечке уведомим РКН за 24 часа и subjects — по закону.')}
    <div class="kv"><span>Условия использования</span></div>
    <p class="sub"><a onclick="go('terms')">Читать оферту</a> · <a onclick="wipe()">Удалить мои данные</a></p>
    <div style="height:20px"></div></div>`;
}
function vTerms() {
  const op = OPERATOR;
  return `<div class="wrap">
    <div class="row"><button class="iconbtn" onclick="privBack()" aria-label="Назад">${ic('back', 19)}</button>
    <div class="grow"><h1 class="title" style="font-size:24px">Условия использования</h1></div></div>
    <p class="sub">Пользуясь sainvio (${esc(op.name)}), ты принимаешь эти условия. Сервис — рекомендации по одежде, не договор купли-продажи: сами вещи продают WB/Ozon по их правилам.</p>
    <div class="kv"><span>Аккаунт</span></div>
    <p class="sub">Логин 3–20 символов, пароль от 6 символов. Не передавай доступ третьим лицам. 18+ либо с согласия родителя.</p>
    <div class="kv"><span>Контент</span></div>
    <p class="sub">Загружай только свои фото и только то, что разрешено. Запрещено: чужой контент без прав, оскорбления, обход защиты, спам, парсинг.</p>
    <div class="kv"><span>Ответственность</span></div>
    <p class="sub">Подборки — предположения AI под твой вкус; размер, посадку, наличие и цену проверяй у продавца. Сервис «как есть», бесплатный уровень без гарантий непрерывности.</p>
    <div class="kv"><span>Оплата и партнёрки</span></div>
    <p class="sub">Доступ бесплатный. Переходы в магазины могут приносить сервису комиссию — цена для тебя не меняется. Рекламные размещения маркируются.</p>
    <div class="kv"><span>Связь</span></div>
    <p class="sub">${esc(op.email)} · ${esc(op.address)}</p>
    <div style="height:20px"></div></div>`;
}

/* ---------- favorites / profile ---------- */
function vFav() {
  return `<div class="wrap"><h1 class="title">Сохранённое</h1><p class="sub">AI учитывает это в следующих подборках.</p>
  <div id="favgrid" style="margin-top:12px"><div class="empty"><p class="small">Загружаем…</p></div></div><div style="height:20px"></div></div>`;
}
window.__loadFav = async function () {
  const el = document.getElementById('favgrid'); if (!el) return;
  const showEmpty = () => { el.innerHTML = `<div class="empty"><h3>Пока пусто</h3><p class="small">Нажимай на сердечко — будем подбирать точнее.</p><button class="btn secondary" onclick="go('home')">К подборке</button></div>`; };
  if (!Api.ok) {
    if (!S.favorites.length) { showEmpty(); return; }
    const items = S.favorites.map((id) => RC[id] || Demo.rank([Demo.find(id)].filter(Boolean), S.profile, demoFb())[0]).filter(Boolean);
    items.forEach((p) => { RC[p.id] = p; });
    el.innerHTML = `<div class="feed">${items.map((x, i) => cardHtml(x, i)).join('')}</div>`;
    return;
  }
  try {
    const r = await Api.get('/api/favorites');
    S.favorites = r.favorites || S.favorites; save();
    if (!S.favorites.length) { el.innerHTML = `<div class="empty"><h3>Пока пусто</h3><p class="small">Нажимай на сердечко — будем подбирать точнее.</p><button class="btn secondary" onclick="go('home')">К подборке</button></div>`; return; }
    const items = [];
    for (const id of S.favorites) {
      try { const p = await Api.get('/api/products/' + id); RC[id] = p.product; items.push(p.product); } catch (e) {}
    }
    el.innerHTML = `<div class="feed">${items.map((x, i) => cardHtml(x, i)).join('')}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty"><h3>Нет соединения</h3></div>`; }
};
function vProfile() {
  const p = S.profile;
  const ins = (S.wardrobe && S.wardrobe.insights) || null;
  const styleNames = { casual: 'Повседневный', smart: 'Smart casual', street: 'Streetwear', minimal: 'Минимализм', sport: 'Спорт', oldmoney: 'Old money', business: 'Деловой', classic: 'Классика', oversize: 'Oversize', party: 'На выход' };
  const colorHex = { black: '#171717', white: '#FFFFFF', olive: '#6B7C3A', beige: '#D9C7A7', gray: '#9AA0A3', green: '#134E3A', blue: '#3B5BFF', brown: '#7A5230' };
  return `<div class="wrap">
    <div class="phead">
      <label class="pava">${S.photo ? `<img src="${S.photo}" alt="">` : `<span>${esc((p.name || 'А')[0])}</span>`}<span class="cam">${ic('camera', 14)}</span><input type="file" accept="image/*" hidden onchange="onPhoto(event)"></label>
      <h1>${esc(p.name)}</h1>
      <p>@${esc(S.login || 'гость')} · ${SEASON_RU[S.ctx.season] || ''}</p>
      <p class="params">${p.height} см · ${p.weight} кг · ${esc(p.topSize)} / ${esc(p.pantsSize)} / ${esc(p.shoeSize)}</p>
    </div>
    <div class="taste">
      <div class="row"><span class="tlabel">Твой вкус</span>${ic('spark', 14)}</div>
      ${ins && ins.count ? `<div class="tcolors">${ins.colors.map((c) => `<span style="background:${colorHex[c] || '#ccc'}"></span>`).join('')}</div>
      <p>${(ins.styles || []).map((s) => styleNames[s] || s).join(' · ') || 'Разное'} · ${ins.count} вещей в гардеробе</p>`
      : `<p>Добавь вещи в гардероб — здесь появится твоя палитра и стили, а подборки станут точнее.</p>
      <button class="tbtn" onclick="go('wardrobe')">Открыть гардероб</button>`}
    </div>
    <div class="pstats"><div><b>${S.savedOutfits.length}</b><span>образов</span></div><div><b>${S.favorites.length}</b><span>сохранено</span></div><div><b>${(S.wardrobe.items || []).length}</b><span>в гардеробе</span></div></div>
    <div class="pgroup"><div class="ptitle">Стиль</div>
      <button class="prow" onclick="go('wardrobe')"><span class="tint">${ic('shirt', 18)}</span><span>Мой гардероб<small>AI учитывает вкус</small></span>${ic('chevR', 16)}</button>
      <button class="prow" onclick="go('outfits')"><span class="tint">${ic('star', 18)}</span><span>Мои образы<small>${S.savedOutfits.length} сохранено</small></span>${ic('chevR', 16)}</button>
      <button class="prow" onclick="go('params')"><span class="tint">${ic('sliders', 18)}</span><span>Мои параметры<small>Рост, размеры</small></span>${ic('chevR', 16)}</button>
    </div>
    <div class="pgroup"><div class="ptitle">Аккаунт</div>
      <button class="prow" onclick="go('privacy')"><span class="tint">${ic('shield', 18)}</span><span>Конфиденциальность<small>Политика по 152-ФЗ</small></span>${ic('chevR', 16)}</button>
      <button class="prow" onclick="go('terms')"><span class="tint">${ic('chevR', 16)}</span><span>Условия использования<small>Оферта сервиса</small></span>${ic('chevR', 16)}</button>
      <button class="prow" onclick="logout()"><span class="tint">${ic('user', 18)}</span><span>Выйти<small>${esc(S.login || '')}</small></span>${ic('chevR', 16)}</button>
    </div>
    <div class="pgroup danger">
      <button class="prow" onclick="wipe()"><span class="tint red">${ic('trash', 18)}</span><span>Удалить мои данные</span></button>
    </div>
    <div style="height:20px"></div></div>`;
}
window.wipe = async function () {
  if (!confirm('Удалить все мои данные? Фото, профиль, гардероб и история исчезнут безвозвратно.')) return;  try { await Api.req('/api/profile', { method: 'DELETE' }); } catch (e) {}
  try { await Api.post('/api/auth/logout', { token: S.token }); } catch (e) {}
  localStorage.removeItem(LS);
  try { localStorage.removeItem(LS_LEGACY); } catch (e) {}
  try { localStorage.removeItem(LS_W); } catch (e) {}
  try { localStorage.removeItem(LS_W_LEGACY); } catch (e) {}
  const tok = null;
  S = defaultStateFresh();
  S._fed = S._ofed = S._wfed = false;
  save(); go('welcome');
};
function defaultStateFresh() {
  return {
    route: 'welcome', params: {},
    profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
    photo: null, aiNote: '', done: false,
    favorites: [], savedOutfits: [], chat: [], cid: null,
    feed: { title: 'Для тебя', items: [], total: 0 },
    feedOutfits: [], gapItems: [], wardrobe: { items: [], insights: null },
    ctx: { season: 'autumn', weather: null },
    ob: { styles: [] }, greeted: false,
    token: tok, login: '', authMode: 'login', authErr: ''
  };
}

/* route side-effects */
const __render = render;
function seedGreeting() {
  if (S.greeted || S.chat.length) return;
  S.greeted = true;
  S.chat.push({
    role: 'ai', id: 'm-hello', t: Date.now(),
    text: `Привет${S.profile.name ? ', ' + S.profile.name : ''}! Я sainvio. Могу подобрать вещи под твой вкус и бюджет, собрать готовый образ, найти похожее по фото и объяснить, почему вещь тебе подойдёт. Просто напиши, что ищем — например: «куртка на осень».`
  });
  save();
}
render = function () {
  if (S.route === 'home') seedGreeting();
  __render();
  if (S.route === 'home') {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const ob = document.getElementById('offlinebar');
        if (ob) ob.innerHTML = `<div class="offline">Нет соединения — показываем сохранённое локально.</div>`;
      }
    } catch (e) {}
  }
  if (S.route === 'product') window.__loadProduct(S.params.id);
  if (S.route === 'favorites') window.__loadFav();
  if (S.route === 'home' && !S.feed.items.length && !S._fed) { S._fed = true; loadFeed('').then(() => { if (S.route === 'home') render(); }); }
  if (S.route === 'home' && !S.feedOutfits.length && !S._ofed) { S._ofed = true; loadOutfits().then(() => { if (S.route === 'home') render(); }); }
  if ((S.route === 'home' || S.route === 'profile') && !S._wfed) { S._wfed = true; loadWardrobe().then(() => { loadGaps().then(() => { if (['home', 'profile'].includes(S.route)) render(); }); }); }
};

/* init */
render();
