/* features.js — умные функции sainvio. Подключается ПОСЛЕ chat.js. Приветственный экран и тёмная тема не затрагиваются.
   Что внутри: онбординг (3 карточки), подсказки стилиста, палитра по фото с подтверждением, 👍/👎 под ответами,
   замена одной вещи в образе, образ из гардероба, капсула, календарь образов, слежение за ценой, сравнение двух вещей,
   подбор размера, карточка-картинка образа, журнал «надел», скелетоны и пустые состояния, PWA. */
'use strict';
(function () {
  if (window.__featuresLoaded) return; window.__featuresLoaded = true;

  Object.assign(P, {
    thumbUp: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.7 0 2.6 1.2 2.3 2.8L12.8 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>',
    thumbDown: '<path d="M7 13V4H4v9z"/><path d="M7 13l4 7c1.7 0 2.6-1.2 2.3-2.8L12.8 14H19a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.8 4H7"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    scale: '<path d="M12 4v16M5 20h14"/><path d="M4 8h16"/><path d="M4 8l-2 6a3 3 0 0 0 4 0zM20 8l-2 6a3 3 0 0 0 4 0z"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>'
  });

  /* ---------- общие помощники ---------- */
  const FA = { get: (p) => Api.get('/api/features/' + p), post: (p, b, ms) => Api.post('/api/features/' + p, b || {}, ms) };
  const FSK = () => 'sainvio_fx_' + (S.login || 'anon');
  const fsAll = () => { try { return JSON.parse(localStorage.getItem(FSK()) || '{}'); } catch (e) { return {}; } };
  const fsGet = (k) => fsAll()[k];
  const fsSet = (k, v) => { const o = fsAll(); o[k] = v; try { localStorage.setItem(FSK(), JSON.stringify(o)); } catch (e) { /* без хранилища */ } };
  const FX = { state: null, hints: null, hintsT: 0, watch: new Set(), unread: 0, cmpA: null, cap: null, cal: null, log: null, prices: null, swap: null, installEv: null, busy: {}, onb: { step: 0 } };
  const lite = (p) => ({ id: p.id, title: p.title, price: p.price, old: p.old, img: p.img, cat: p.cat, colors: p.colors, styles: p.styles, sizes: p.sizes, aiScore: p.aiScore, aiConf: p.aiConf, seasons: p.seasons, url: p.url, nmId: p.nmId, mp: p.mp, rating: p.rating, reviews: p.reviews, brand: p.brand });
  const wardItem = (id) => ((S.wardrobe && S.wardrobe.items) || []).find((w) => w.id === id);
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return b; return c; };
  const ownProd = (id, extra) => { const w = wardItem(id) || {}; return Object.assign({ id, own: true, title: w.title || 'Вещь из гардероба', img: w.photo || '', price: 0, cat: w.cat || 'top', colors: w.colors || [], styles: w.styles || [] }, extra || {}); };
  function hydrate(o) {
    if (!o || !o.items) return o;
    o.items = o.items.map((it) => {
      if (typeof it === 'string') return RC[it] || it;
      if (it.own && !it.img) { const w = wardItem(String(it.id).replace(/^own/, '')); if (w && w.photo) it.img = w.photo; }
      return it;
    });
    return o;
  }
  const tile = (it, cls) => `<span class="tile ${cls || ''}" style="background:${(window.CDOT || {})[(it.colors || [])[0]] || '#B8B8C0'}">${esc((it.title || '').slice(0, 14))}</span>`;
  const thumb = (it) => (it && it.img ? IM(it.img, it.title) : tile(it || {}));
  const dateRu = (d, o) => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', o);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const online = () => navigator.onLine !== false;
  const skelGrid = (n) => `<div class="fxskel">${Array.from({ length: n || 4 }, () => '<div class="skel"></div>').join('')}</div>`;
  const empty = (icon, title, text, btn) => `<div class="fxempty"><div class="eic" style="width:56px;height:56px;border-radius:50%;background:var(--mint);display:flex;align-items:center;justify-content:center;margin:0 auto">${ic(icon, 26)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn ? `<div style="height:14px"></div>${btn}` : ''}</div>`;
  const back = (to) => `<button class="iconbtn" onclick="go('${to || 'profile'}')" aria-label="Назад">${ic('back', 19)}</button>`;
  const errBox = (retry) => `<div class="fxempty">${ic('alert', 28)}<h3>Не получилось загрузить</h3><p>Проверь соединение.</p><div style="height:14px"></div><button class="btn secondary" onclick="${retry}">Повторить</button></div>`;

  /* ---------- тема: авто / светлая / тёмная ---------- */
  const TK = 'sainvio_theme';
  const themeMode = () => { try { const v = localStorage.getItem(TK); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; } };
  const themeNow = (m) => (m === 'auto' ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : m);
  function applyTheme() {
    const t = themeNow(themeMode());
    document.documentElement.setAttribute('data-theme', t);
    const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.setAttribute('content', t === 'dark' ? '#0E0E10' : '#134E3A');
  }
  window.fxTheme = function (m) { try { if (m === 'auto') localStorage.removeItem(TK); else localStorage.setItem(TK, m); } catch (e) { /* без хранилища */ } applyTheme(); if (S.route === 'profile') render(); };
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themeMode() === 'auto') applyTheme(); }); } catch (e) { /* старый браузер */ }
  applyTheme();

  /* ---------- маршрутизация: свои экраны ---------- */
  const CUSTOM = { onb: () => vOnb(), capsule: () => vCapsule(), calendar: () => vCalendar(), compare: () => vCompare(), log: () => vLog(), prices: () => vPrices(), notifs: () => vPrices() };
  const INIT = { capsule: () => loadCapsule(), calendar: () => loadCalendar(), compare: () => loadCompare(), log: () => loadLog(), prices: () => loadPrices(), notifs: () => loadPrices() };
  NEED_AUTH.push('onb', 'capsule', 'calendar', 'compare', 'log', 'prices', 'notifs');
  const __go = window.go;
  window.go = function (route, params) {
    if (route === 'style' && !S.done) route = 'onb'; // первый запуск: вместо плоского выбора стиля — три больших карточки
    if (route === 'onb') FX.onb.step = 0;
    closeSheet(); // шторка живёт только на своём экране
    return __go(route, params);
  };
  const __render = render;
  render = function () {
    if (CUSTOM[S.route]) renderCustom();
    else { __render(); afterRender(); }
    fxLayout();
  };
  /* ---------- адаптив: боковое меню на ПК, data-route для CSS ---------- */
  const DESK = (window.matchMedia ? window.matchMedia('(min-width:1024px)') : { matches: false });
  const SIDE_ROUTES = ['home', 'outfits', 'wardrobe', 'favorites', 'profile', 'chat', 'results', 'product', 'outfit', 'capsule', 'calendar', 'compare', 'log', 'prices', 'notifs'];
  const SIDE_ACTIVE = { results: 'home', product: 'home', outfit: 'outfits', notifs: 'prices' };
  const SIDE_TOOLS = [['chat', 'Стилист', 'spark'], ['capsule', 'Капсула', 'hanger'], ['calendar', 'Календарь', 'sun'], ['compare', 'Сравнить', 'sliders'], ['log', 'Журнал', 'check'], ['prices', 'Цены', 'star']];
  function fxLayout() {
    const st = $('.stage'); if (st && st.setAttribute) st.setAttribute('data-route', S.route);
    if (!DESK.matches || !SIDE_ROUTES.includes(S.route)) return;
    const tabs = $('#tabs'); if (!tabs) return;
    const act = SIDE_ACTIVE[S.route] || S.route;
    const btn = ([r, t, i]) => `<button class="tab ${act === r ? 'on' : ''}" onclick="go('${r}')" aria-label="${t}">${ic(i, 22)}${t}</button>`;
    const label = { auto: 'авто', light: 'светлая', dark: 'тёмная' }[themeMode()] || 'авто';
    tabs.hidden = false;
    tabs.innerHTML = TABS.map(btn).join('') + '<div class="tabsep"></div>' + SIDE_TOOLS.map(btn).join('')
      + `<button class="tab tabfoot" onclick="fxThemeCycle()" aria-label="Сменить тему">Тема: ${label}</button>`;
    const app = $('#app'); if (app) app.classList.remove('notabs');
  }
  window.fxThemeCycle = function () { window.fxTheme({ auto: 'light', light: 'dark', dark: 'auto' }[themeMode()] || 'light'); fxLayout(); };
  try { DESK.addEventListener('change', () => { if (S.route !== 'welcome') render(); }); } catch (e) { /* старый браузер */ }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  function renderCustom() {
    const st = $('.stage'); if (st) { st.classList.remove('chatmode'); st.style.height = ''; }
    const app = $('#app'); app.innerHTML = `<div class="screen">${CUSTOM[S.route]()}</div>`;
    const tabs = $('#tabs'), showTabs = S.route !== 'onb';
    tabs.hidden = !showTabs; app.classList.toggle('notabs', !showTabs);
    if (showTabs) tabs.innerHTML = TABS.map(([r, t, i]) => `<button class="tab ${S.route === r ? 'on' : ''}" onclick="go('${r}')" aria-label="${t}">${ic(i, 24)}${t}</button>`).join('');
    if (INIT[S.route]) INIT[S.route]();
  }
  function afterRender() {
    if (!S.token) return;
    if (S.route === 'home') homeInit();
    if (S.route === 'profile' && !FX.state && !FX.busy.state) loadState(true);
  }
  /* загрузка сводного состояния (лимиты, слежение, непрочитанное) */
  async function loadState(rerender) {
    FX.busy.state = true;
    try {
      const r = await FA.get('state'); FX.state = r; FX.watch = new Set(r.watching || []); FX.unread = r.unread || 0;
      if (rerender && ['home', 'profile'].includes(S.route)) render();
    } catch (e) { /* сервер без умных функций — просто без них */ } finally { FX.busy.state = false; }
  }
  async function loadHints() {
    if (Date.now() - FX.hintsT < 10 * 60e3) return false;
    FX.hintsT = Date.now();
    try { const r = await FA.get('hints'); const j = JSON.stringify(r.hints || []); const ch = j !== JSON.stringify(FX.hints || []); FX.hints = r.hints || []; return ch; } catch (e) { return false; }
  }
  function homeInit() {
    if (FX.busy.home) return; FX.busy.home = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([loadHints(), FX.state ? Promise.resolve(false) : loadState(false).then(() => true)]);
        if ((a || b) && S.route === 'home') render();
        fxPalette(); checkPrices(false);
        if (S.done && !fsGet('onbDone')) { fsSet('onbDone', 1); }
      } finally { setTimeout(() => { FX.busy.home = false; }, 1500); }
    })();
  }

  /* ---------- главная: инструменты и подсказки ---------- */
  const __vHome = window.vHome;
  window.vHome = function () {
    const h = __vHome();
    const tools = `<div class="fxtools">
      <button class="fxtool" onclick="ask('Собери образ из моего гардероба')">${ic('hanger', 16)}Из моего гардероба</button>
      <button class="fxtool" onclick="go('calendar')">${ic('cal', 16)}Образы на неделю</button>
      <button class="fxtool" onclick="go('capsule')">${ic('shirt', 16)}Капсула</button>
      <button class="fxtool" onclick="go('prices')">${ic('bell', 16)}Цены${FX.unread ? `<span class="b">${FX.unread}</span>` : ''}</button></div>`;
    const hints = (FX.hints || []).map((x, i) => `<div class="hint"><span class="hi">${ic(x.icon || 'spark', 17)}</span><div><p>${esc(x.text)}</p><div class="ha"><button onclick="fxHint(${i})">${esc(x.action.label)}</button><button class="g" onclick="fxHintX(${i})">Не сейчас</button></div></div></div>`).join('');
    return h.replace('<div id="offlinebar"></div>', '<div id="offlinebar"></div>' + hints + tools);
  };
  window.fxHint = async function (i) {
    const x = (FX.hints || [])[i]; if (!x) return; const a = x.action || {};
    FX.hints.splice(i, 1);
    try { await FA.post('hints/dismiss', { key: x.key, accept: a.accept || null }); } catch (e) { /* не страшно */ }
    if (a.accept && a.accept.type === 'style') { S.profile.styles = Array.from(new Set((S.profile.styles || []).concat([a.accept.value]))); save(); toast('Запомнил'); }
    else if (a.accept) toast('Запомнил');
    if (a.ask) { askAI(a.ask); return; }
    if (a.go) { go(a.go); return; }
    if (S.route === 'home') render();
  };
  window.fxHintX = async function (i) {
    const x = (FX.hints || [])[i]; if (!x) return; FX.hints.splice(i, 1);
    try { await FA.post('hints/dismiss', { key: x.key }); } catch (e) { /* ok */ }
    if (S.route === 'home') render();
  };

  /* ---------- шторки ---------- */
  function openSheet(html) {
    closeSheet();
    const st = $('.stage'); const d = document.createElement('div'); d.className = 'fxsheet'; d.id = 'fxsheet';
    d.innerHTML = `<div class="sheetbg" onclick="fxClose()"></div><div class="sheet"><div class="grab"></div>${html}</div>`;
    st.appendChild(d);
  }
  function closeSheet() { const d = document.getElementById('fxsheet'); if (d) d.remove(); }
  window.fxClose = closeSheet;

  /* ---------- палитра по фото с подтверждением ---------- */
  let PAL = null;
  async function fxPalette() {
    if (fsGet('palAsked') || !S.photo || !S.photoConsent || !S.done || !online() || document.getElementById('fxsheet')) return;
    try {
      let r = await FA.post('palette/suggest', {});
      if (!(r.colors || []).length && !r.limited) {
        const img = typeof shrinkPhoto === 'function' ? await shrinkPhoto(S.photo) : null;
        if (img && img.length < 1300000) r = await FA.post('palette/suggest', { image: img }, 30000);
      }
      if (r.limited) return;
      fsSet('palAsked', 1);
      if (!(r.colors || []).length || S.route !== 'home') return;
      PAL = { colors: r.colors, on: r.colors.map((c) => c.key) };
      palSheet();
    } catch (e) { /* без палитры тоже ок */ }
  }
  function palSheet() {
    const names = PAL.colors.filter((c) => PAL.on.includes(c.key)).map((c) => c.label.toLowerCase());
    openSheet(`<h2 style="margin:0;font-size:21px">Тебе, кажется, идут эти цвета</h2>
      <p class="sub" style="margin-top:6px">Это предположение по фото. Отметь, что добавить в твою палитру — остальное не изменится.</p>
      <div class="palchips">${PAL.colors.map((c) => `<button class="palchip ${PAL.on.includes(c.key) ? 'on' : ''}" onclick="fxPalTog('${c.key}')"><i style="background:${(window.CDOT || {})[c.key] || '#ccc'}"></i>${esc(c.label)}</button>`).join('')}</div>
      <button class="btn" onclick="fxPalOk()" ${PAL.on.length ? '' : 'disabled'}>${PAL.on.length ? 'Добавить: ' + esc(names.join(', ')) : 'Ничего не выбрано'}</button>
      <button class="link" style="width:100%;justify-content:center;margin-top:6px" onclick="fxPalNo()">Нет, не добавлять</button>`);
  }
  window.fxPalTog = (k) => { const i = PAL.on.indexOf(k); if (i >= 0) PAL.on.splice(i, 1); else PAL.on.push(k); palSheet(); };
  window.fxPalOk = async function () {
    const acc = PAL.on.slice(), rej = PAL.colors.map((c) => c.key).filter((k) => !acc.includes(k));
    closeSheet();
    try { const r = await FA.post('palette/confirm', { accept: acc, reject: rej }); if (r.colors) S.profile.colors = r.colors; save(); toast('Палитра обновлена'); } catch (e) { toast('Не получилось сохранить'); }
  };
  window.fxPalNo = async function () {
    const rej = PAL.colors.map((c) => c.key); closeSheet();
    try { await FA.post('palette/confirm', { accept: [], reject: rej }); } catch (e) { /* ok */ }
  };

  /* ---------- 👍/👎 под ответами стилиста ---------- */
  const REASONS = ['Не тот стиль', 'Дорого', 'Не мой цвет', 'Не то просил'];
  window.__fbRow = function (m) {
    if (!m || m.role !== 'ai' || m.id === 'm-hello' || m.loading || m.error) return '';
    return fbHtml(m);
  };
  function fbHtml(m) {
    const v = m.fb || 0;
    return `<div class="fbrow" id="fb-${m.id}"><button class="${v === 1 ? 'on' : ''}" onclick="fbMsg('${m.id}',1)" aria-label="Полезно">${ic('thumbUp', 16)}</button>
      <button class="${v === -1 ? 'on' : ''}" onclick="fbMsg('${m.id}',-1)" aria-label="Не то">${ic('thumbDown', 16)}</button>
      ${v === -1 && !m.fbReason ? `<span class="why">${REASONS.map((r) => `<button onclick="fbReason('${m.id}',${JSON.stringify(r).replace(/"/g, '&quot;')})">${r}</button>`).join('')}</span>` : ''}
      ${v && (v === 1 || m.fbReason) ? '<span class="thx">Спасибо, учту</span>' : ''}</div>`;
  }
  function fbRedraw(m) { const el = document.getElementById('fb-' + m.id); if (el) el.outerHTML = fbHtml(m); }
  window.fbMsg = function (id, v) {
    const m = S.chat.find((x) => x.id === id); if (!m) return;
    m.fb = m.fb === v ? 0 : v; m.fbReason = ''; save(); fbRedraw(m);
    if (m.fb) FA.post('ai-feedback', { messageId: id, cid: S.cid, value: m.fb, query: m.query || '' }).catch(() => {});
  };
  window.fbReason = function (id, r) {
    const m = S.chat.find((x) => x.id === id); if (!m) return;
    m.fbReason = r; save(); fbRedraw(m);
    FA.post('ai-feedback', { messageId: id, cid: S.cid, value: -1, reason: r, query: m.query || '' }).catch(() => {});
  };

  /* ---------- избранное = «сообщи, если подешевеет» ---------- */
  const __fav = window.fav;
  window.fav = async function (id) {
    const was = S.favorites.includes(id);
    await __fav(id);
    const now = S.favorites.includes(id), p = RC[id];
    const snap = fsGet('favSnap') || {};
    if (now && p) { snap[id] = lite(p); const ks = Object.keys(snap); if (ks.length > 60) delete snap[ks[0]]; fsSet('favSnap', snap); }
    if (!now) { delete snap[id]; fsSet('favSnap', snap); }
    if (!was && now && p && p.price && online()) {
      try { await FA.post('price/watch', { product: lite(p), on: true }); FX.watch.add(id); setTimeout(() => toast('Сообщим, если подешевеет'), 900); ensurePush(); } catch (e) { /* без слежения */ }
    } else if (was && !now && FX.watch.has(id)) { FA.post('price/watch', { product: { id }, on: false }).catch(() => {}); FX.watch.delete(id); }
  };
  window.fxWatch = async function (id) {
    const p = RC[id]; if (!p) return;
    const on = !FX.watch.has(id);
    try {
      await FA.post('price/watch', { product: lite(p), on });
      if (on) { FX.watch.add(id); toast('Слежу за ценой'); ensurePush(); } else { FX.watch.delete(id); toast('Больше не слежу'); }
      const b = document.getElementById('fxw'); if (b) { b.classList.toggle('on', on); b.innerHTML = ic('bell', 16) + (on ? ' Слежу за ценой' : ' Следить за ценой'); }
    } catch (e) { toast('Не получилось — попробуй позже'); }
  };
  /* ---------- уведомления: Web Push (если на сервере настроены VAPID-ключи) или локально ---------- */
  const b64u = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
  async function ensurePush() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
      const st = FX.state || (await FA.get('state').catch(() => null)); if (st) FX.state = st;
      if (st && st.push && st.push.enabled && st.push.key) {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(st.push.key) });
        await FA.post('push/subscribe', { subscription: sub.toJSON() });
      }
    } catch (e) { /* уведомления не критичны */ }
  }
  async function notify(text) {
    try {
      if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready; await reg.showNotification('sainvio', { body: text, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'price', data: { url: '/' } }); return;
      }
    } catch (e) { /* упадём в тост */ }
    toast(text);
  }
  const wbPrice = (p) => { if (p.salePriceU) return Math.round(p.salePriceU / 100); let m = 0; (p.sizes || []).forEach((s) => { const v = s && s.price && (s.price.product || s.price.total); if (v && (!m || v < m)) m = v; }); return Math.round(m / 100); };
  async function checkPrices(force) {
    if (!S.token || !online()) return;
    if (!force && Date.now() - (fsGet('lastPrice') || 0) < 30 * 60e3) return;
    fsSet('lastPrice', Date.now());
    try {
      const l = await FA.get('price/list'); const items = l.items || []; FX.watch = new Set(items.map((i) => i.id));
      const nm = items.filter((i) => i.nmId).map((i) => i.nmId).slice(0, 40);
      if (nm.length) {
        try { // свежие цены: сначала с браузера пользователя (его IP WB обычно пускает)
          const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
          const r = await fetch(`https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nm.join(';')}`, { signal: c.signal }); clearTimeout(t);
          if (r.ok) { const j = await r.json(); const reps = ((j.data && j.data.products) || j.products || []).map((p) => ({ id: 'wb' + p.id, price: wbPrice(p) })).filter((x) => x.price); if (reps.length) await FA.post('price/report', { items: reps }); }
        } catch (e) { /* браузер не достучался — сервер проверит сам по расписанию */ }
      }
      const n = await FA.get('notes'); const shown = fsGet('shownNotes') || [];
      const fresh = (n.notes || []).filter((x) => !x.read && !shown.includes(x.id));
      FX.unread = (n.notes || []).filter((x) => !x.read).length;
      for (const x of fresh.slice(0, 3)) await notify(x.text);
      if (fresh.length) { fsSet('shownNotes', shown.concat(fresh.map((x) => x.id)).slice(-60)); if (S.route === 'home') render(); }
    } catch (e) { /* без слежения */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkPrices(false); });

  /* ---------- страница товара: слежение, сравнение, размер ---------- */
  const __lf = window.__loadFactors;
  window.__loadFactors = async function (id, isLive) {
    try { productExtras(id); } catch (e) { /* без доп. блока */ }
    return __lf(id, isLive);
  };
  function productExtras(id) {
    const anchor = document.getElementById('whyrows'); const p = RC[id];
    if (!anchor || !p || document.getElementById('fxbtns')) return;
    const w = FX.watch.has(id), other = FX.cmpA && FX.cmpA !== id ? RC[FX.cmpA] : null;
    const box = document.createElement('div');
    box.innerHTML = `<div class="fxbtns" id="fxbtns"><button id="fxw" class="${w ? 'on' : ''}" onclick="fxWatch('${id}')">${ic('bell', 16)} ${w ? 'Слежу за ценой' : 'Следить за ценой'}</button>
      <button onclick="fxCmp('${id}')">${ic('scale', 16)} ${other ? 'Сравнить с «' + esc(other.title.slice(0, 18)) + '»' : 'Сравнить'}</button></div><div id="fxsize"></div>`;
    anchor.parentNode.insertBefore(box, anchor);
    if (online() && p.cat && ['top', 'bottom', 'shoes'].includes(p.cat)) {
      FA.post('size', { product: lite(p) }).then((r) => {
        const el = document.getElementById('fxsize'); if (!el || S.route !== 'product') return;
        if (!r.ok) { el.innerHTML = `<div class="sizeadv small">${esc(r.message || '')}</div>`; return; }
        el.innerHTML = `<div class="sizeadv"><b class="big">${esc(r.recommended)}</b> ${r.shift ? '<span class="tagw">не твой обычный ' + esc(r.base) + '</span>' : '<span class="tagg">твой размер</span>'}
          <div style="margin-top:6px">${esc(r.note)}</div><div class="small" style="margin-top:4px;color:var(--muted)">Основа: ${esc(r.basis)}${r.reviewsUsed ? ', отзывов о посадке: ' + r.reviewsUsed : ''}.</div></div>`;
      }).catch(() => {});
    }
  }
  window.fxCmp = function (id) {
    if (!FX.cmpA || FX.cmpA === id) { FX.cmpA = id; toast('Открой вторую вещь и нажми «Сравнить»'); return; }
    const a = FX.cmpA; FX.cmpA = null; go('compare', { a, b: id });
  };

  /* ---------- сравнение двух вещей ---------- */
  function vCompare() {
    const { a, b } = S.params || {}; const A = RC[a], B = RC[b];
    if (!A || !B) return `<div class="wrap"><div class="fxhead">${back('home')}<h1>Сравнение</h1></div>${empty('scale', 'Нечего сравнивать', 'Открой одну вещь, нажми «Сравнить», затем открой вторую.', '<button class="btn" onclick="go(\'home\')">В ленту</button>')}</div>`;
    return `<div class="wrap"><div class="fxhead">${back('home')}<h1>Сравнение</h1></div>
      <div id="cmpbody">${skelGrid(2)}</div></div>`;
  }
  async function loadCompare() {
    const { a, b } = S.params || {}; const A = RC[a], B = RC[b]; if (!A || !B) return;
    const el = document.getElementById('cmpbody');
    try {
      const r = await FA.post('compare', { a: lite(A), b: lite(B) });
      if (S.route !== 'compare' || !el) return;
      const card = (p, k) => `<div class="c ${r.winner === k ? 'w' : ''}" onclick="go('product',{id:'${p.id}'})"><div class="im">${IM(p.img, p.title)}</div><div class="t"><b>${esc(fmt(p.price))}</b>${esc(p.title.slice(0, 50))}</div></div>`;
      el.innerHTML = `<div class="cmpgrid">${card(A, 'a')}${card(B, 'b')}</div>
        <div style="margin-top:8px">${r.rows.map((x) => `<div class="cmprow"><div class="v ${x.win === 'a' ? 'w' : ''}">${esc(x.a)}</div><div class="l">${esc(x.label)}</div><div class="v ${x.win === 'b' ? 'w' : ''}">${esc(x.b)}</div></div>`).join('')}</div>
        <div class="verdict2">${esc(r.verdict)}</div>`;
    } catch (e) { if (el) el.innerHTML = errBox('loadCompare()'); }
  }
  window.loadCompare = loadCompare;

  /* ---------- образ: замена вещи, «надел», картинка ---------- */
  window.vOutfit = function (id) {
    const o = hydrate(findOutfit(id));
    if (!o) return `<div class="wrap"><div class="empty"><h3>Образ не найден</h3><button class="btn secondary" onclick="go('home')">Домой</button></div></div>`;
    const items = o.items || [];
    const saved = S.savedOutfits.some((x) => x.id === o.id);
    return `<div class="wrap"><div class="row"><button class="iconbtn" onclick="history.length&&go('home')" aria-label="Назад">${ic('back', 19)}</button></div>
      <h1 class="title" style="margin-top:12px">${esc(o.name)}</h1>
      <p class="sub"><b style="color:var(--ink)">${o.score}%</b> тебе подходит · ${o.total ? fmt(o.total) : 'без покупок'}${o.ownCount ? ' · часть вещей уже есть' : ''}</p>
      <div class="ocollage" style="margin-top:14px">${items.map((p) => (p.img ? IM(p.img, p.title) : tile(p))).join('')}</div>
      ${(o.why || []).length ? `<div class="note">${(o.why || []).map((w) => '· ' + esc(w)).join('<br>')}</div>` : ''}
      <div style="margin-top:6px">${items.map((p, i) => `<div class="kv"><span>${esc(p.title)}</span><b>${p.own ? '<span style="color:var(--ok)">есть у тебя</span>' : fmt(p.price)}<button class="swapbtn" onclick="fxSwap('${o.id}',${i})" aria-label="Заменить вещь">${ic('swap', 14)}</button></b></div>`).join('')}</div>
      <div class="fxbtns"><button onclick="fxWorn('${o.id}')">${ic('check', 16)} Надел сегодня</button><button onclick="fxShareImg('${o.id}')">${ic('image', 16)} Картинкой</button></div>
      <div style="height:150px"></div>
      <div class="cta">${saved ? `<button class="btn secondary" onclick="go('outfits')">Уже сохранён</button>` : `<button class="btn" onclick="keepOutfit('${o.id}')">${ic('check', 16)} Сохранить образ</button>`}<button class="btn secondary" onclick="shareOutfit('${o.id}')">${ic('share', 16)} Поделиться</button></div></div>`;
  };
  const __outfitCard = window.outfitCard;
  window.outfitCard = function (o) { return __outfitCard(hydrate(o)); };

  window.fxSwap = async function (oid, idx) {
    const o = findOutfit(oid); if (!o) return;
    openSheet(`<h2 style="margin:0;font-size:20px">Заменить вещь</h2><p class="sub">Остальные вещи остаются — подберу совместимую замену.</p><div id="swapbody">${skelGrid(2)}</div>`);
    const cur = o.items[idx];
    const pool = Object.values(RC).concat(S.feed.items || [], S.gapItems || []).filter((p) => p && p.id && p.price && !p.items && p.cat === cur.cat);
    const uniq = {}; pool.forEach((p) => { uniq[p.id] = p; });
    try {
      const r = await FA.post('replace', { items: o.items.map((x) => ({ id: x.id, own: !!x.own, title: x.title, cat: x.cat, colors: x.colors, styles: x.styles, price: x.price || 0, aiScore: x.aiScore, seasons: x.seasons })), index: idx, pool: Object.values(uniq).sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, 50).map(lite) });
      FX.swap = { oid, idx, c: r.candidates || [] };
      const el = document.getElementById('swapbody'); if (!el) return;
      el.innerHTML = FX.swap.c.length ? FX.swap.c.map((c, k) => `<button class="swapc" onclick="fxSwapPick(${k})">${c.item.img ? IM(c.item.img, c.item.title) : tile(c.item)}<span class="tx">${esc(c.item.title.slice(0, 48))}<span>${c.item.own ? 'есть у тебя' : fmt(c.item.price)}${c.why ? ' · ' + esc(c.why) : ''}</span></span><span class="dl ${c.delta > 0 ? 'up' : ''}">${c.score}%${c.delta ? ' (' + (c.delta > 0 ? '+' : '') + c.delta + ')' : ''}</span></button>`).join('')
        : empty('search', 'Замен пока нет', 'В ленте нет подходящих вещей этой категории. Попроси стилиста найти.', `<button class="btn" onclick="fxClose();ask('Подбери другую вещь вместо «${esc(cur.title).replace(/'/g, '')}» к этому образу')">Спросить стилиста</button>`);
    } catch (e) { const el = document.getElementById('swapbody'); if (el) el.innerHTML = errBox(`fxSwap('${oid}',${idx})`); }
  };
  window.fxSwapPick = function (k) {
    const s = FX.swap; if (!s) return; const c = s.c[k]; const o = findOutfit(s.oid); if (!o || !c) return;
    const it = c.item; const full = !it.own && RC[it.id] ? RC[it.id] : (it.own ? ownProd(it.id, { title: it.title, img: it.img }) : it);
    o.items[s.idx] = full; o.score = c.score; o.total = o.items.reduce((t, x) => t + (x.own ? 0 : (x.price || 0)), 0);
    o.ownCount = o.items.filter((x) => x.own).length; RC[o.id] = o; save(); closeSheet(); render(); toast('Заменил');
  };
  window.fxWorn = async function (oid) {
    const o = hydrate(findOutfit(oid)); if (!o) return;
    try {
      await FA.post('outfits/log', { kind: 'worn', name: o.name, date: today(), items: o.items.map((x) => ({ id: x.id, title: x.title, cat: x.cat, price: x.price || 0, own: !!x.own, img: /^https?:/.test(x.img || '') ? x.img : '' })) });
      toast('Записал — такой же образ предлагать не буду');
    } catch (e) { toast('Не получилось записать'); }
  };
  /* картинка-карточка образа (canvas). Фото с чужих доменов могут «запачкать» canvas — тогда рисуем без фото. */
  function loadImg(src) { return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.crossOrigin = 'anonymous'; const t = setTimeout(() => res(null), 4000); i.onload = () => { clearTimeout(t); res(i); }; i.onerror = () => { clearTimeout(t); res(null); }; i.src = src; }); }
  async function drawCard(o, withPhotos) {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#F7F6F2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#134E3A'; g.font = '700 40px Inter, system-ui, sans-serif'; g.fillText('sainvio', 60, 100);
    g.fillStyle = '#171717'; g.font = '700 60px Inter, system-ui, sans-serif';
    const name = String(o.name || 'Образ'); g.fillText(name.length > 26 ? name.slice(0, 25) + '…' : name, 60, 190);
    g.fillStyle = '#6E6E73'; g.font = '500 34px Inter, system-ui, sans-serif'; g.fillText((o.score ? o.score + '% тебе подходит' : '') + (o.total ? ' · ' + fmt(o.total) : ' · без покупок'), 60, 245);
    const items = (o.items || []).slice(0, 4), cell = 480, gap = 20, x0 = 60, y0 = 300;
    const imgs = withPhotos ? await Promise.all(items.map((it) => loadImg(it.img))) : items.map(() => null);
    items.forEach((it, i) => {
      const x = x0 + (i % 2) * (cell + gap), y = y0 + Math.floor(i / 2) * (cell + gap + 60);
      g.save(); g.beginPath(); g.roundRect ? g.roundRect(x, y, cell, cell, 28) : g.rect(x, y, cell, cell); g.clip();
      const im = imgs[i];
      if (im) { const k = Math.max(cell / im.width, cell / im.height); g.drawImage(im, x + (cell - im.width * k) / 2, y + (cell - im.height * k) / 2, im.width * k, im.height * k); }
      else { g.fillStyle = (window.CDOT || {})[(it.colors || [])[0]] || '#C9C9D0'; g.fillRect(x, y, cell, cell); g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 34px Inter, system-ui, sans-serif'; g.fillText(String(it.title || '').slice(0, 18), x + 24, y + cell / 2); }
      g.restore();
      g.fillStyle = '#171717'; g.font = '600 30px Inter, system-ui, sans-serif'; g.fillText(String(it.title || '').slice(0, 24), x, y + cell + 40);
    });
    g.fillStyle = '#6E6E73'; g.font = '500 28px Inter, system-ui, sans-serif'; g.fillText('Собрано в sainvio · AI-стилист', 60, H - 50);
    return c;
  }
  window.fxShareImg = async function (oid) {
    const o = hydrate(findOutfit(oid)); if (!o) return; toast('Готовлю картинку…');
    let blob = null;
    try { const c = await drawCard(o, true); blob = await new Promise((r) => { try { c.toBlob(r, 'image/png'); } catch (e) { r(null); } }); } catch (e) { blob = null; }
    if (!blob) { try { const c = await drawCard(o, false); blob = await new Promise((r) => c.toBlob(r, 'image/png')); } catch (e) { blob = null; } }
    if (!blob) { toast('Не получилось сделать картинку'); return; }
    const file = new File([blob], 'sainvio-outfit.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: o.name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sainvio-outfit.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Картинка сохранена');
  };

  /* ---------- капсула ---------- */
  function vCapsule() {
    return `<div class="wrap"><div class="fxhead">${back('profile')}<h1>Капсула гардероба</h1></div><p class="sub">Какие сочетания получаются из твоих вещей и чего не хватает.</p><div id="capbody">${skelGrid(4)}</div></div>`;
  }
  async function loadCapsule() {
    const el = document.getElementById('capbody'); if (!el) return;
    const cands = Object.values(RC).concat(S.feed.items || [], S.gapItems || []).filter((p) => p && p.id && p.price && !p.items && ['top', 'bottom', 'shoes'].includes(p.cat)).slice(0, 40).map(lite);
    try {
      const r = await FA.post('capsule', { candidates: cands }); FX.cap = r;
      if (S.route !== 'capsule') return;
      if (!r.ok) { el.innerHTML = `<div class="fxnote warn">${esc(r.message)}</div>` + empty('hanger', 'Гардероб пока маловат', 'Добавь вещи — и я покажу, сколько образов из них выходит.', '<button class="btn" onclick="go(\'wardrobe\')">Открыть гардероб</button>'); return; }
      const mini = (ids) => ids.slice(0, 4).map((id) => { const w = wardItem(id); return w && w.photo ? `<img src="${w.photo}" alt="">` : tile(ownProd(id)); }).join('');
      el.innerHTML = `<div class="fxstats"><div><b>${r.items.length}</b><span>вещей</span></div><div><b>${r.total}</b><span>образов</span></div><div><b>${(r.strong[0] && r.strong[0].uses) || 0}</b><span>у лучшей вещи</span></div></div>
        <div class="fxnote">${esc(r.message)}</div>
        ${r.weak.length ? `<div class="sect big"><div><h2>Слабые места</h2></div></div><div class="chiprow">${r.weak.map((w) => `<span class="tagw">${esc(w.title)} · ${w.uses}</span>`).join('')}</div>` : ''}
        ${r.gains.length ? `<div class="sect big"><div><h2>Что докупить</h2><span class="sub2">даст больше всего новых образов</span></div></div>${r.gains.map((g) => `<button class="fxrow" onclick="go('product',{id:'${g.id}'})"><span class="th">${IM(g.img, g.title)}</span><span class="tx"><b>${esc(g.title)}</b><span>${fmt(g.price)}</span></span><span class="rt dn">+${g.newOutfits}</span></button>`).join('')}` : ''}
        <div class="sect big"><div><h2>Образы</h2></div></div>
        <div class="fxgrid">${r.outfits.slice(0, 20).map((o, i) => `<button class="fxo" onclick="fxCapOpen(${i})"><div class="mini">${mini(o.ids)}</div><b>${esc(o.name)}</b><span>${o.score}%</span></button>`).join('')}</div><div style="height:20px"></div>`;
    } catch (e) { el.innerHTML = errBox('loadCapsule()'); }
  }
  window.loadCapsule = loadCapsule;
  window.fxCapOpen = function (i) {
    const c = FX.cap && FX.cap.outfits[i]; if (!c) return;
    const byId = {}; FX.cap.items.forEach((x) => { byId[x.id] = x; });
    const o = hydrate({ id: 'cap_' + c.id + '_' + i, name: c.name, score: c.score, total: 0, why: c.why, ownCount: c.ids.length, items: c.ids.map((id) => ownProd(id, byId[id] ? { title: byId[id].title, cat: byId[id].cat, colors: byId[id].colors } : {})) });
    RC[o.id] = o; go('outfit', { id: o.id });
  };

  /* ---------- календарь образов ---------- */
  function vCalendar() {
    return `<div class="wrap"><div class="fxhead">${back('home')}<h1>Образы на неделю</h1></div><p class="sub">Из твоих вещей, с учётом погоды и без повторов подряд.</p><div id="calbody">${skelGrid(3)}</div></div>`;
  }
  async function loadCalendar() {
    const el = document.getElementById('calbody'); if (!el) return; const geo = fsGet('geo') || {};
    try {
      const r = await FA.post('calendar', { days: 7, lat: geo.lat, lon: geo.lon }, 20000); FX.cal = r;
      if (S.route !== 'calendar') return;
      if (!r.ok) { el.innerHTML = `<div class="fxnote warn">${esc(r.message)}</div>` + empty('cal', 'Нужно больше вещей', 'Для календаря нужны верх, низ и обувь в гардеробе.', '<button class="btn" onclick="go(\'wardrobe\')">В гардероб</button>'); return; }
      const t0 = today();
      el.innerHTML = (r.note ? `<div class="fxnote warn">${esc(r.note)} <button class="link" style="padding:0" onclick="fxGeo()">Использовать моё место</button></div>` : '')
        + r.days.map((d, i) => `<button class="fxday ${d.date === t0 ? 'today' : ''}" onclick="fxCalOpen(${i})"><span class="dt"><b>${esc(dateRu(d.date, { weekday: 'short' }))}</b><i>${new Date(d.date + 'T12:00:00').getDate()}</i><div class="tp">${typeof d.temp === 'number' ? (d.temp > 0 ? '+' : '') + d.temp + '°' : ''}${d.rain ? ' ☂' : ''}</div></span>
          <span class="tx" style="flex:1;min-width:0">${d.outfit ? `<b style="display:block;font-size:14px">${esc(d.outfit.name)}</b><span class="small muted">${esc(d.outfit.items.map((x) => x.title.toLowerCase()).join(' · ').slice(0, 70))}</span>` : '<span class="small muted">Подходящего образа нет</span>'}</span>${d.outfit ? `<span class="rt">${d.outfit.score}%</span>` : ''}</button>`).join('')
        + `<div style="height:20px"></div>`;
    } catch (e) { el.innerHTML = errBox('loadCalendar()'); }
  }
  window.loadCalendar = loadCalendar;
  window.fxCalOpen = function (i) {
    const d = FX.cal && FX.cal.days[i]; if (!d || !d.outfit) return;
    const o = hydrate({ id: 'cal_' + d.date, name: d.outfit.name + ' · ' + dateRu(d.date, { weekday: 'short', day: 'numeric' }), score: d.outfit.score, total: 0, why: d.outfit.why, ownCount: d.outfit.items.length, items: d.outfit.items.map((x) => ownProd(x.id, { title: x.title, cat: x.cat, colors: x.colors })) });
    RC[o.id] = o; go('outfit', { id: o.id });
  };
  window.fxGeo = function () {
    if (!navigator.geolocation) { toast('Геолокация недоступна'); return; }
    navigator.geolocation.getCurrentPosition((p) => { fsSet('geo', { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }); toast('Место запомнил'); render(); }, () => toast('Не удалось определить место'), { timeout: 8000 });
  };

  /* ---------- журнал «надел» ---------- */
  function vLog() { return `<div class="wrap"><div class="fxhead">${back('profile')}<h1>Журнал образов</h1></div><p class="sub">Что ты носил. Стилист не будет предлагать такие же образы снова.</p><div id="logbody">${skelGrid(2)}</div></div>`; }
  async function loadLog() {
    const el = document.getElementById('logbody'); if (!el) return;
    try {
      const r = await FA.get('outfits/log'); if (S.route !== 'log') return;
      const list = r.log || [];
      el.innerHTML = list.length ? list.map((x) => `<div class="fxrow"><span class="th">${x.items.slice(0, 4).map((it) => { const w = it.own ? wardItem(String(it.id).replace(/^own/, '')) : null; const src = it.img || (w && w.photo) || ''; return src ? IM(src, it.title) : tile(it); }).join('')}</span><span class="tx"><b>${esc(x.name)}</b><span>${esc(dateRu(x.date, { day: 'numeric', month: 'long' }))} · ${x.kind === 'worn' ? 'надел' : 'сохранил'}</span></span><button class="iconbtn" style="width:36px;height:36px" onclick="fxLogDel('${x.id}')" aria-label="Удалить">${ic('trash', 15)}</button></div>`).join('')
        : empty('book', 'Пока пусто', 'Открой образ и нажми «Надел сегодня» — здесь появится история.', '<button class="btn" onclick="go(\'outfits\')">К образам</button>');
    } catch (e) { el.innerHTML = errBox('loadLog()'); }
  }
  window.loadLog = loadLog;
  window.fxLogDel = async function (id) { try { await FA.post('outfits/log/delete', { id }); loadLog(); } catch (e) { toast('Не получилось'); } };

  /* ---------- цены и уведомления ---------- */
  function vPrices() { return `<div class="wrap"><div class="fxhead">${back('profile')}<h1>Цены</h1></div><p class="sub">Сердечко = «сообщи, если подешевеет». Проверяем несколько раз в день.</p><div id="pricebody">${skelGrid(2)}</div></div>`; }
  async function loadPrices() {
    const el = document.getElementById('pricebody'); if (!el) return;
    try {
      const [l, n] = await Promise.all([FA.get('price/list'), FA.get('notes')]); if (S.route !== 'prices' && S.route !== 'notifs') return;
      FX.watch = new Set((l.items || []).map((i) => i.id));
      const notes = (n.notes || []).filter((x) => x.type === 'price');
      el.innerHTML = (notes.length ? `<div class="sect big"><div><h2>Новое</h2></div></div>${notes.slice(0, 6).map((x) => `<div class="fxnote ${x.read ? '' : ''}">${esc(x.text)}</div>`).join('')}` : '')
        + `<div class="sect big"><div><h2>Слежу · ${(l.items || []).length}</h2></div></div>`
        + ((l.items || []).length ? l.items.map((w) => { const dn = w.price0 && w.last < w.price0 ? Math.round((1 - w.last / w.price0) * 100) : 0; return `<div class="fxrow"><span class="th" style="grid-template-columns:1fr">${w.img ? IM(w.img, w.title) : ''}</span><span class="tx" onclick="go('product',{id:'${w.id}'})"><b>${esc(w.title)}</b><span>${fmt(w.last)}${dn ? ' · дешевле на ' + dn + '% с момента добавления' : ''}</span></span><button class="iconbtn" style="width:36px;height:36px" onclick="fxUnwatch('${w.id}')" aria-label="Не следить">${ic('x', 15)}</button></div>`; }).join('')
          : empty('heart', 'Пока ни за чем не слежу', 'Нажми сердечко у вещи — и я сообщу, когда она подешевеет.', '<button class="btn" onclick="go(\'home\')">В ленту</button>'));
      if (notes.some((x) => !x.read)) { FA.post('notes/read', {}).catch(() => {}); FX.unread = 0; }
    } catch (e) { el.innerHTML = errBox('loadPrices()'); }
  }
  window.loadPrices = loadPrices;
  window.fxUnwatch = async function (id) { try { await FA.post('price/watch', { product: { id }, on: false }); FX.watch.delete(id); loadPrices(); } catch (e) { toast('Не получилось'); } };

  /* ---------- онбординг: три больших карточки ---------- */
  const BUDGETS = [[3000, 'до 3 000 ₽', 'базовые вещи'], [5000, 'до 5 000 ₽', 'золотая середина'], [8000, 'до 8 000 ₽', 'качество выше'], [15000, 'от 8 000 ₽', 'без ограничений']];
  const TOPS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'], PANTS = ['28', '29', '30', '31', '32', '33', '34', '36', '38'], SHOES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
  function opts(list, cur) { const l = list.slice(); if (cur && !l.includes(String(cur))) l.unshift(String(cur)); return l; }
  function vOnb() {
    const st = FX.onb.step, p = S.profile;
    const dots = `<div class="onbdots">${[0, 1, 2].map((i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>`;
    let card = '';
    if (st === 0) card = `<div class="big"><h2>Какой у тебя стиль?</h2><p>Выбери до трёх — можно поменять потом.</p><div class="opt">${STYLES.map(([k, t]) => `<button class="${S.ob.styles.includes(k) ? 'on' : ''}" onclick="onbStyle('${k}')">${t}</button>`).join('')}</div></div>`;
    if (st === 1) card = `<div class="big"><h2>Сколько обычно тратишь на вещь?</h2><p>Подбирать буду в этих пределах.</p><div class="opt">${BUDGETS.map(([v, t, s]) => `<button class="${Number(p.budget) === v ? 'on' : ''}" onclick="onbBudget(${v})">${t}<small>${s}</small></button>`).join('')}</div></div>`;
    if (st === 2) card = `<div class="big"><h2>Проверь размеры</h2><p>Заполнили из твоих параметров. Исправь, если не так.</p>
      <div class="szl">Верх</div><div class="sz">${opts(TOPS, p.topSize).map((v) => `<button class="${String(p.topSize) === v ? 'on' : ''}" onclick="onbSize('topSize','${v}')">${v}</button>`).join('')}</div>
      <div class="szl">Низ</div><div class="sz">${opts(PANTS, p.pantsSize).map((v) => `<button class="${String(p.pantsSize) === v ? 'on' : ''}" onclick="onbSize('pantsSize','${v}')">${v}</button>`).join('')}</div>
      <div class="szl">Обувь</div><div class="sz">${opts(SHOES, p.shoeSize).map((v) => `<button class="${String(p.shoeSize) === v ? 'on' : ''}" onclick="onbSize('shoeSize','${v}')">${v}</button>`).join('')}</div></div>`;
    return `<div class="wrap onb">${dots}<p class="small muted" style="margin:0">Шаг ${st + 1} из 3</p>${card}
      <div style="height:18px"></div><button class="btn" onclick="onbNext()">${st === 2 ? 'Готово' : 'Дальше'}</button>
      <button class="link" style="width:100%;justify-content:center" onclick="onbSkip()">${st === 2 ? 'Оставить как есть' : 'Пропустить'}</button><div style="height:24px"></div></div>`;
  }
  window.onbStyle = (k) => { const a = S.ob.styles, i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else if (a.length < 3) a.push(k); else toast('Не больше трёх'); save(); render(); };
  window.onbBudget = (v) => { S.profile.budget = v; save(); render(); };
  window.onbSize = (k, v) => { S.profile[k] = v; save(); render(); };
  window.onbNext = function () { if (FX.onb.step < 2) { FX.onb.step++; render(); $('#app').scrollTop = 0; } else onbFinish(); };
  window.onbSkip = function () { if (FX.onb.step < 2) { FX.onb.step++; render(); } else onbFinish(); };
  function onbFinish() {
    S.profile.styles = S.ob.styles.slice(); save();
    Api.post('/api/profile', { profile: S.profile }).catch(() => {});
    go('analyzing');
  }

  /* ---------- скелетоны и пустые состояния ---------- */
  window.vFav = function () {
    return `<div class="wrap"><h1 class="title">Сохранённое</h1><p class="sub">AI учитывает это в следующих подборках.</p><div id="favgrid" style="margin-top:12px">${skelGrid(4)}</div><div style="height:20px"></div></div>`;
  };
  window.__loadFav = async function () {
    const el = document.getElementById('favgrid'); if (!el) return;
    const none = () => { el.innerHTML = empty('heart', 'Пока пусто', 'Нажимай на сердечко — буду подбирать точнее и сообщу, если вещь подешевеет.', '<button class="btn" onclick="go(\'home\')">К подборке</button>'); };
    try { const r = await Api.get('/api/favorites'); S.favorites = r.favorites || S.favorites; save(); } catch (e) { if (!S.favorites.length && !online()) { el.innerHTML = errBox('__loadFav()'); return; } }
    if (!S.favorites.length) { none(); return; }
    const snap = fsGet('favSnap') || {}; const items = [];
    for (const id of S.favorites) {
      let p = RC[id] || snap[id];
      if (!p) { try { p = (await Api.get('/api/products/' + id)).product; } catch (e) { p = null; } }
      if (p) { RC[id] = RC[id] || p; items.push(RC[id]); }
    }
    if (S.route !== 'favorites') return;
    if (items.length) el.innerHTML = `<div class="feed">${items.map((x, i) => cardHtml(x, i)).join('')}</div>`; else none();
  };
  window.vOutfits = function () {
    const list = S.savedOutfits.concat(S.feedOutfits).map(hydrate);
    const loading = !S._ofed && !list.length;
    return `<div class="wrap"><h1 class="title">Образы</h1><p class="sub">Готовые комплекты под твой профиль.</p>
      <div class="fxtools" style="margin-top:12px"><button class="fxtool" onclick="go('capsule')">${ic('shirt', 16)}Капсула</button><button class="fxtool" onclick="go('calendar')">${ic('cal', 16)}На неделю</button><button class="fxtool" onclick="go('log')">${ic('book', 16)}Журнал</button></div>
      <div style="height:12px"></div><button class="btn secondary" onclick="buildNew()">${ic('plus', 16)} Собрать новые</button>
      ${loading ? `<div style="margin-top:14px">${skelGrid(2)}</div>` : `<div style="display:grid;gap:12px;margin-top:14px">${list.map(outfitCard).join('') || empty('shirt', 'Пока нет образов', 'Нажми «Собрать новые» — подберу под твой профиль и погоду.')}</div>`}
      <div style="height:20px"></div></div>`;
  };
  const __lw = loadWardrobe;
  loadWardrobe = async function () { try { await __lw(); } finally { S._wdone = true; } };
  const __vProfile = window.vProfile || vProfile;
  window.vProfile = function () {
    let h = __vProfile();
    if (!S._wdone) h = h.replace(/<div class="taste">[\s\S]*?(?=<div class="pstats">)/, '<div class="taste"><div class="skel" style="height:14px;width:90px"></div><div class="skel" style="height:28px;width:60%;margin-top:12px"></div></div>');
    const u = FX.state && FX.state.usage;
    const usage = u ? `<div class="usage">Вопросов стилисту сегодня: <b style="color:var(--ink)">${u.chat.used} из ${u.chat.cap}</b><div class="bar"><i style="width:${Math.min(100, Math.round(u.chat.used / u.chat.cap * 100))}%"></i></div></div>` : '';
    const row = (go, icn, t, s, badge) => `<button class="prow" onclick="${go}"><span class="tint">${ic(icn, 18)}</span><span>${t}<small>${s}</small></span>${badge ? `<span class="tagw">${badge}</span>` : ''}${ic('chevR', 16)}</button>`;
    const ios = /iphone|ipad/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
    const inst = FX.installEv ? row('fxInstall()', 'phone', 'Установить на экран', 'Открывается как приложение') : (ios ? row('fxInstall()', 'phone', 'Установить на экран', 'Поделиться → «На экран Домой»') : '');
    const group = `<div class="pgroup"><div class="ptitle">Умные функции</div>
      ${row("go('capsule')", 'shirt', 'Капсула гардероба', 'Сколько образов из твоих вещей')}
      ${row("go('calendar')", 'cal', 'Образы на неделю', 'С учётом погоды')}
      ${row("go('log')", 'book', 'Журнал образов', 'Что ты носил')}
      ${row("go('prices')", 'bell', 'Слежу за ценой', FX.watch.size + ' ' + plural(FX.watch.size, 'вещь', 'вещи', 'вещей'), FX.unread ? FX.unread + ' нов.' : '')}
      ${('Notification' in window && Notification.permission === 'default') ? row('ensurePushUI()', 'bell', 'Включить уведомления', 'Когда вещь подешевеет') : ''}${inst}</div>`;
    const tm = themeMode(); const theme = `<div class="pgroup"><div class="ptitle">Оформление</div><div class="chips themeopts">${[['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, t]) => `<button class="chip ${tm === k ? 'on' : ''}" onclick="fxTheme('${k}')">${t}</button>`).join('')}</div></div>`;
    const marker = '<div class="pgroup"><div class="ptitle">Аккаунт</div>';
    return h.indexOf(marker) >= 0 ? h.replace(marker, usage + group + theme + marker) : h + usage + group + theme;
  };
  window.ensurePushUI = async function () { await ensurePush(); toast(Notification.permission === 'granted' ? 'Уведомления включены' : 'Уведомления не разрешены'); render(); };
  window.fxInstall = async function () {
    if (FX.installEv) { FX.installEv.prompt(); try { await FX.installEv.userChoice; } catch (e) { /* ignore */ } FX.installEv = null; render(); }
    else toast('В Safari: «Поделиться» → «На экран Домой»');
  };

  /* ---------- PWA ---------- */
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); FX.installEv = e; if (S.route === 'profile') render(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/pwa-sw.js').catch(() => { /* без офлайна */ }); });
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open') go('prices'); });
  }
  window.addEventListener('online', () => { if (S.token) { checkPrices(false); } });
  render(); // перерисовать с учётом подключённых переопределений
})();
