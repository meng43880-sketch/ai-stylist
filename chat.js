/* chat.js — подключается ПОСЛЕ app.js. Переопределяет: главную, чат (новый маршрут 'chat'),
   карточки, страницу товара, отзывы, гардероб (шторка). Приветственный экран не трогает. */
'use strict';
(function () {
  /* ---------- иконки ---------- */
  Object.assign(P, {
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>'
  });
  const chatOn = () => S.route === 'chat';
  NEED_AUTH.push('chat');
  let HOME_SCROLL = 0, CDRAFT = '', CIMG = null, BUSY = false, CANCEL = false, STAGE_T = null, NEAR_BOTTOM = true;
  const msgs = () => S.chat.filter((m) => m.id !== 'm-hello');
  const hasConv = () => S.chat.some((m) => m.role === 'me');
  const nl2br = (t) => esc(t).replace(/\n/g, '<br>');
  const pct = (p) => (p.aiScore ? ((p.aiConf != null && p.aiConf < 0.45 ? '≈' : '') + p.aiScore + '%') : '');

  /* ---------- маршрутизация: чат + сохранение прокрутки главной ---------- */
  const __go = window.go;
  window.go = function (route, params) {
    const app = $('#app');
    if (S.route === 'home' && app) HOME_SCROLL = app.scrollTop || 0;
    const back = route === 'home' && ['product', 'results', 'outfit', 'outfits'].includes(S.route);
    __go(route, params);
    if (back && $('#app')) $('#app').scrollTop = HOME_SCROLL;
    if (route === 'chat') scrollBottom(true);
  };
  const __render = render;
  render = function () {
    if (chatOn()) { renderChat(); return; }
    leaveChat();
    __render();
  };
  function leaveChat() {
    const st = $('.stage');
    if (st) { st.classList.remove('chatmode'); st.style.height = ''; }
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', vvFit);
    clearInterval(STAGE_T);
  }
  function vvFit() {
    const st = $('.stage');
    if (!st || !st.classList.contains('chatmode') || !window.visualViewport || window.innerWidth >= 520) return;
    st.style.height = window.visualViewport.height + 'px';
    window.scrollTo(0, 0);
    scrollBottom(true);
  }
  window.openChat = function () { go('chat'); };

  /* ---------- главная ---------- */
  window.homeCat = function (c) { S.homeCat = c || ''; render(); };
  window.vHome = function () {
    const p = S.profile, w = S.ctx.weather;
    const cat = S.homeCat || '';
    const feed = (cat ? S.feed.items.filter((x) => x.cat === cat) : S.feed.items).slice(0, 8);
    const chips = [['', 'Всё'], ['top', 'Верх'], ['bottom', 'Низ'], ['shoes', 'Обувь'], ['acc', 'Аксессуары']];
    return `<div class="wrap">
      <div class="row"><div class="grow"><div class="hello" id="seasonline">${seasonText()}${w && w.city ? ` · ${esc(w.city)}` : ''}</div>
      <h1 class="title">Привет${p.name ? ', ' + esc(p.name) : ''}!</h1></div>
      ${S.photo ? `<img class="avatar" src="${S.photo}" onclick="go('profile')" alt="Профиль">` : `<button class="avatar" onclick="go('profile')">${esc((p.name || '?')[0])}</button>`}</div>
      <div id="offlinebar"></div>
      <button class="aientry" onclick="openChat()"><span class="cav">${spark(14)}</span><span class="ph1">Что подобрать?</span><span class="ic1">${ic('camera', 20)}</span></button>
      <div class="catchips">${chips.map(([k, t]) => `<button class="chip ${cat === k ? 'on' : ''}" onclick="homeCat('${k}')">${t}</button>`).join('')}</div>
      <div class="sect big"><div><h2>Образы дня</h2><span class="sub2">собраны под твой профиль и погоду</span></div><button class="link" onclick="go('outfits')">Все ${ic('chevR', 13)}</button></div>
      ${S.feedOutfits.length ? `<div class="ohscroll">${S.feedOutfits.map(outfitCard).join('')}</div>` : `<button class="btn secondary" onclick="makeOutfits()">Собрать образы</button>`}
      <div class="sect big"><div><h2>${esc(cat ? 'В этой категории' : S.feed.title)}</h2><span class="sub2">${S.feed.total ? S.feed.total + ' вариантов' : 'лента соберётся под запрос'}</span></div></div>
      ${feed.length ? `<div class="feed">${feed.map((x, i) => cardHtml(x, i)).join('')}</div>`
        : (S.feed.items.length ? `<div class="empty"><div class="eic">${ic('search', 24)}</div><h3>Тут пока пусто</h3><p class="small">Выбери другую категорию или спроси стилиста.</p></div>`
          : `<div class="feed">${[1, 2, 3, 4].map(() => '<div class="skel" style="height:240px"></div>').join('')}</div>`)}
      ${S.gapItems.length ? `<div class="sect big"><div><h2>Дополни гардероб</h2><span class="sub2">этого тебе не хватает</span></div></div><div class="feed">${S.gapItems.map((x, i) => cardHtml(x, i)).join('')}</div>` : ''}
      <div style="height:8px"></div></div>`;
  };
  window.cardHtml = function (p, i) {
    const fav = S.favorites.includes(p.id);
    const rc = p.reviews >= 1000 ? (p.reviews / 1000).toFixed(1).replace('.', ',') + 'k' : (p.reviews || 0);
    const disc = p.old > p.price ? Math.round((1 - p.price / p.old) * 100) : 0;
    return `<button class="card" onclick="go('product',{id:'${p.id}'})">
      <span class="ph">${IM(p.img, p.title)}${p.live ? '<span class="livedot2"></span>' : ''}${disc >= 10 ? `<span class="disc">−${disc}%</span>` : ''}
      <span class="fav ${fav ? 'on' : ''}" data-fav="${p.id}" onclick="event.stopPropagation();fav('${p.id}')" role="button" aria-label="В избранное">${ic('heart', 16)}</span></span>
      <span class="ct">${esc(p.title)}</span><span class="pr">${fmt(p.price)}${p.old > p.price ? `<s>${fmt(p.old)}</s>` : ''}</span>
      <span class="row2"><span>${p.rating ? '★ ' + p.rating + ' · ' + rc : (p.mp === 'OZON' ? 'Ozon' : 'WB')}</span>${p.aiScore ? `<span class="sc">${pct(p)}</span>` : ''}</span></button>`;
  };
  window.outfitCard = function (o) {
    const own = o.ownCount ? `<span class="own">· ${o.ownCount} из гардероба</span>` : '';
    return `<button class="ocard" onclick="go('outfit',{id:'${o.id}'})">
      <span class="coll">${o.items.slice(0, 4).map((p) => IM(p.img, p.title)).join('')}</span>
      <span class="inf"><span class="bt">${esc(o.name)}</span><span class="meta"><strong>${o.score}%</strong> · ${fmt(o.total)} · ${o.items.length} вещи ${own}</span>
      ${(o.why || [])[0] ? `<span class="owhy">${esc(o.why[0])}</span>` : ''}</span></button>`;
  };
  /* fav без полной перерисовки (в чате она сбрасывала прокрутку) */
  const __fav = window.fav;
  window.fav = async function (id) {
    if (!['chat', 'home'].includes(S.route)) return __fav(id);
    const i = S.favorites.indexOf(id);
    if (i >= 0) S.favorites.splice(i, 1); else { S.favorites.push(id); toast('Сохранено — учтём в подборках'); }
    save();
    document.querySelectorAll('[data-fav="' + id + '"]').forEach((el) => el.classList.toggle('on', S.favorites.includes(id)));
    try {
      if (i >= 0) await Api.post('/api/favorites', { action: 'remove', productId: id });
      else { await Api.post('/api/favorites', { productId: id }); await Api.post('/api/feedback', { productId: id, kind: 'like' }); }
    } catch (e) { /* локально сохранено */ }
  };

  /* ---------- чат: отрисовка ---------- */
  function when(t) {
    const d = new Date(t || Date.now()), now = new Date();
    const hm = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    return d.toDateString() === now.toDateString() ? 'Сегодня, ' + hm : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + hm;
  }
  function pickCard(p, reason, warn) {
    const fav = S.favorites.includes(p.id);
    const r = reason || (p.why && p.why[0]) || '';
    const w = !r && p.warn && p.warn[0] ? p.warn[0] : '';
    return `<div class="pcard" role="button" onclick="go('product',{id:'${p.id}'})"><div class="pph">${IM(p.img, p.title)}${p.aiScore ? `<span class="pbadge">${pct(p)}</span>` : ''}
      <button class="pfav ${fav ? 'on' : ''}" data-fav="${p.id}" onclick="event.stopPropagation();fav('${p.id}')" aria-label="В избранное">${ic('heart', 16)}</button></div>
      <div class="pt">${esc(p.title)}</div><div class="pp">${fmt(p.price)}</div>${r ? `<div class="prs">${esc(r)}</div>` : (w ? `<div class="prs warn">${esc(w)}</div>` : '')}</div>`;
  }
  function msgBody(m, isLast) {
    if (m.role === 'me') return `<div class="cm me"><div class="cme">${m.img ? `<img src="${m.img}" alt="">` : ''}${nl2br(m.text)}</div></div>`;
    const idx = S.chat.indexOf(m);
    const start = idx <= 0 || S.chat[idx - 1].role !== 'ai';
    let inner = '';
    if (m.loading) {
      inner = `<div class="cload"><span class="dotspin"></span><span id="cstage">Смотрю твой профиль…</span></div><div class="skelrow"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
    } else if (m.error) {
      inner = `<div class="cerr">${ic('alert', 20)}<div><b>${esc(m.text || 'Не получилось получить ответ')}</b><span class="small">Проверь соединение и попробуй ещё раз.</span><br><button onclick="retryLast()">Повторить</button></div></div>`;
    } else {
      inner = `<div class="ctext">${nl2br(m.text)}</div>`;
      const picks = (m.picks || []).map((id) => RC[id]).filter(Boolean);
      if (picks.length) inner += `<div class="pcarousel">${picks.map((p) => pickCard(p, (m.pickReasons || {})[p.id])).join('')}</div>`;
      const live = (m.live || []).map((id) => RC[id]).filter(Boolean);
      if (live.length) inner += `<div class="livelab"><span class="livedot"></span>Свежее с Wildberries</div><div class="pcarousel">${live.map((p) => pickCard(p)).join('')}</div>`;
      if (m.liveBusy) inner += `<div class="livebusy">Ищу свежие цены на WB…</div>`;
      if (m.outfit && m.outfit.items) inner += `<div style="margin-top:12px">${outfitCard(m.outfit)}</div>`;
      if (picks.length || live.length) inner += `<div class="more"><button class="link" style="padding:6px 0" onclick="openAll('${m.id}')">Показать все ${m.total || (m.allPicks || []).length || ''} ${ic('chevR', 13)}</button><button class="link" style="padding:6px 0" onclick="chatToFeed('${m.id}')">В ленту</button></div>`;
      if (isLast && !BUSY && (m.quick || []).length) inner += `<div class="quick">${m.quick.map((q) => `<button onclick="ask(${esc(JSON.stringify(q)).replace(/&quot;/g, '&quot;')})">${esc(q)}</button>`).join('')}</div>`;
      if (!BUSY && window.__fbRow) inner += window.__fbRow(m);
      if (isLast && !BUSY) inner += `<div class="cactions"><button onclick="copyMsg('${m.id}')" aria-label="Копировать">${ic('copy', 17)}</button><button onclick="ask('Покажи другие варианты, не те же самые')" aria-label="Ещё вариант">${ic('refresh', 17)}</button></div>`;
    }
    return `<div class="cm"><span class="cav ${start ? '' : 'gap'}">${start ? spark(13) : ''}</span><div class="cbody">${inner}</div></div>`;
  }
  function wrapHtml(m) {
    const list = msgs(), i = list.indexOf(m), prev = list[i - 1];
    const sep = (!prev || (m.t && prev.t && m.t - prev.t > 30 * 60000)) && m.t ? `<div class="cdate">${when(m.t)}</div>` : '';
    const lastAi = [...list].reverse().find((x) => x.role === 'ai');
    return `<div class="cmwrap" data-mid="${m.id}">${sep}${msgBody(m, lastAi === m && list[list.length - 1] === m)}</div>`;
  }
  function intro() {
    const t = S.ctx.weather && typeof S.ctx.weather.temp === 'number' ? S.ctx.weather.temp : null;
    const sg = [['Образ на выходные', 'Собери образ на выходные', 'shirt'], ['Подбери куртку', 'Подбери куртку на осень', 'hanger'],
      ['Из моего гардероба', 'Собери образ из моего гардероба', 'hanger'],
      [t != null ? 'Что надеть при ' + (t > 0 ? '+' : '') + t + '°' : 'Что надеть сегодня', 'Что надеть сегодня' + (t != null ? ' при ' + t + ' градусах' : ''), 'sun']];
    return `<div class="chatintro"><span class="cav">${spark(22)}</span><h2>Привет${S.profile.name ? ', ' + esc(S.profile.name) : ''}!</h2>
      <p>Я стилист. Подберу вещи, соберу образ или найду похожее по фото.</p></div>
      <div class="sugg">${sg.map(([a, q, i]) => `<button onclick="ask(${esc(JSON.stringify(q))})"><span class="si">${ic(i, 18)}</span>${esc(a)}</button>`).join('')}
      <button onclick="chatPhoto()"><span class="si">${ic('camera', 18)}</span>Найди по фото</button></div>`;
  }
  function renderChat() {
    S.chat.forEach((m) => { if (m.loading && !BUSY) { m.loading = false; m.error = true; m.text = 'Ответ не дошёл'; } });
    const st = $('.stage');
    st.classList.add('chatmode');
    $('#tabs').hidden = true;
    const app = $('#app'); if (app) app.classList.add('notabs');
    app.innerHTML = `<div class="screen chatscreen"><div class="chatpage">
      <header class="chathead"><button class="iconbtn" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button>
        <div class="ttl"><b>Стилист</b><span>sainvio</span></div>
        <button class="iconbtn" onclick="newChat2()" aria-label="Новый диалог">${ic('edit', 18)}</button></header>
      ${navigator.onLine === false ? '<div class="offbar">Нет соединения</div>' : ''}
      <div class="chatscroll" id="msgs">${hasConv() ? msgs().map(wrapHtml).join('') : intro()}</div>
      <button class="newpill" id="newpill" hidden onclick="scrollBottom(true)">${ic('down', 14)} новое</button>
      <div class="composer"><div id="cprev"></div><div class="cbox">
        <button class="cbtn" onclick="chatPhoto()" aria-label="Прикрепить фото">${ic('image', 22)}</button>
        <textarea class="cin" id="cin" rows="1" placeholder="Напиши, что подобрать…" enterkeyhint="send" oninput="cInput(this)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();cSend()}"></textarea>
        <button class="cbtn send" id="csend" onclick="cSend()" aria-label="Отправить" disabled>${ic('send', 18)}</button></div></div></div></div>`;
    const sc = $('#msgs');
    sc.addEventListener('scroll', () => { NEAR_BOTTOM = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120; if (NEAR_BOTTOM) { const np = $('#newpill'); if (np) np.hidden = true; } });
    const ta = $('#cin'); ta.value = CDRAFT; cInput(ta);
    drawPreview(); syncSend();
    if (window.visualViewport) { window.visualViewport.removeEventListener('resize', vvFit); window.visualViewport.addEventListener('resize', vvFit); vvFit(); }
    scrollBottom(true);
  }
  window.scrollBottom = function (force) {
    const sc = $('#msgs'); if (!sc) return;
    if (force || NEAR_BOTTOM) { sc.scrollTop = sc.scrollHeight; NEAR_BOTTOM = true; const np = $('#newpill'); if (np) np.hidden = true; }
    else { const np = $('#newpill'); if (np) np.hidden = false; }
  };
  /* Точечная перерисовка одного сообщения — без render() всей страницы. */
  function draw(m) {
    const sc = $('#msgs'); if (!sc || !chatOn()) return;
    if (!sc.querySelector('[data-mid]')) sc.innerHTML = '';
    const html = wrapHtml(m);
    const old = sc.querySelector('[data-mid="' + m.id + '"]');
    const was = NEAR_BOTTOM;
    if (old) old.outerHTML = html; else sc.insertAdjacentHTML('beforeend', html);
    NEAR_BOTTOM = was;
    scrollBottom(m.role === 'me');
  }
  function redrawTail() { const list = msgs(); list.slice(-3).forEach(draw); }
  window.cInput = function (el) {
    CDRAFT = el.value;
    el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px';
    syncSend();
  };
  function syncSend() {
    const b = $('#csend'); if (!b) return;
    b.disabled = !BUSY && !(CDRAFT.trim() || CIMG);
    b.classList.toggle('stop', BUSY);
    b.innerHTML = BUSY ? ic('stop', 16) : ic('send', 18);
    b.setAttribute('aria-label', BUSY ? 'Остановить' : 'Отправить');
  }
  function drawPreview() {
    const el = $('#cprev'); if (!el) return;
    el.innerHTML = CIMG ? `<div class="cprev"><img src="${CIMG}" alt="Фото"><button onclick="chatImgClear()" aria-label="Убрать фото">${ic('x', 14)}</button></div>` : '';
  }
  window.cSend = function () {
    if (BUSY) { CANCEL = true; toast('Останавливаю'); return; }
    const ta = $('#cin'); if (!ta) return;
    const t = ta.value; ta.value = ''; CDRAFT = ''; cInput(ta);
    askAI(t);
  };
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
            const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            CIMG = c.toDataURL('image/jpeg', 0.8);
          } catch (e) { CIMG = r.result; }
          if (CIMG && CIMG.length > 1100000) { CIMG = null; toast('Фото слишком большое'); }
          if (!chatOn()) go('chat'); else { drawPreview(); syncSend(); }
        };
        img.onerror = () => toast('Не получилось прочитать фото');
        img.src = r.result;
      };
      r.readAsDataURL(f);
    };
    inp.click();
  };
  window.chatImgClear = function () { CIMG = null; drawPreview(); syncSend(); };
  window.newChat2 = function () {
    if (hasConv() && !confirm('Начать новый диалог?')) return;
    S.chat = []; S.cid = 'c' + Date.now(); S.greeted = true; CDRAFT = ''; save(); renderChat(); toast('Новый диалог');
  };
  window.copyMsg = function (id) {
    const m = S.chat.find((x) => x.id === id); if (!m || !m.text) return;
    const done = () => toast('Скопировано');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(done, done); else done();
  };
  window.openAll = function (id) {
    const m = S.chat.find((x) => x.id === id); if (!m) return;
    S.lastResult = { query: m.query || '', queryImg: null, message: m.text, picks: m.allPicks || m.picks || [], live: m.live || [], outfit: m.outfit || null, total: m.total || 0, ok: !m.error };
    S.resultsFrom = 'chat'; go('results');
  };
  window.chatToFeed = function (id) {
    const m = S.chat.find((x) => x.id === id); if (!m) return;
    const items = (m.live || []).concat(m.allPicks || m.picks || []).map((i) => RC[i]).filter(Boolean);
    S.feed = { title: 'Из диалога', items, total: items.length }; save(); toast('Лента на главной обновлена');
  };
  const __vResults = window.vResults;
  window.vResults = function () {
    let h = __vResults();
    if (S.resultsFrom === 'chat') h = h.replace("onclick=\"go('home')\"", "onclick=\"go('chat')\"");
    return h;
  };
  window.retryLast = function () {
    const list = S.chat;
    let img = null, txt = '';
    if (list.length && list[list.length - 1].role === 'ai') list.pop();
    if (list.length && list[list.length - 1].role === 'me') { const me = list.pop(); txt = me.text; img = me.img || null; }
    if (!txt && !img) { toast('Сначала спроси что-нибудь'); return; }
    if (chatOn()) renderChat();
    askAI(txt, img);
  };

  /* ---------- чат: запрос ---------- */
  const STAGES = ['Смотрю твой профиль…', 'Ищу вещи…', 'Подбираю сочетания…', 'Пишу ответ…'];
  function startStages() {
    let i = 0; clearInterval(STAGE_T);
    STAGE_T = setInterval(() => { i = Math.min(STAGES.length - 1, i + 1); const el = $('#cstage'); if (el) el.textContent = STAGES[i]; }, 2200);
  }
  function setMsg(id, patch) {
    const m = S.chat.find((x) => x.id === id); if (!m) return null;
    Object.assign(m, patch); draw(m); return m;
  }
  window.ask = function (t) { askAI(t); };
  window.askAI = async function (text, img) {
    text = (text || '').trim(); img = img || CIMG;
    if ((!text && !img) || BUSY) return;
    if (!window.__extBridge) { /* заказ живья через сервер-реле: домашнее расширение подберёт по тику */ }
    const extP = extLiveQuery(genderQ(text));
    let relayQid = null;
    if (!window.__extBridge) Api.post('/api/live/request', { query: text }).then((r) => { relayQid = r.data && r.data.qid; }).catch(() => {});
    BUSY = true; CANCEL = false; CIMG = null;
    if (!chatOn()) go('chat');
    S.cid = S.cid || ('c' + Date.now());
    const prevAi = [...msgs()].reverse().find((x) => x.role === 'ai');
    const me = { role: 'me', text: text || 'Найди похожие', img: img || null, id: 'm' + Date.now() + 'u', t: Date.now() };
    const mid = 'm' + Date.now();
    const ai = { role: 'ai', text: '', loading: true, id: mid, t: Date.now() };
    S.chat.push(me, ai);
    drawPreview(); syncSend(); draw(me); if (prevAi) draw(prevAi); draw(ai); startStages(); save();
    const finish = (patch) => {
      clearInterval(STAGE_T); BUSY = false; syncSend();
      if (CANCEL) { setMsg(mid, { loading: false, text: 'Остановлено.', picks: [] }); save(); return false; }
      const m = setMsg(mid, Object.assign({ loading: false, t: Date.now(), query: text }, patch));
      S.lastResult = { query: text, queryImg: img || null, message: m.text || '', picks: m.allPicks || m.picks || [], live: m.live || [], outfit: m.outfit || null, total: m.total || 0, ok: !m.error };
      save(); return true;
    };
    try {
      const r = await Api.post('/api/ai/chat', { message: text, conversationId: S.cid, image: img || null }, 45000);
      const d = r.data || {};
      S.cid = d.conversationId || S.cid;
      (d.products || []).forEach((p) => { RC[p.id] = p; });
      const prods = d.products || [];
      const modelPicks = (d.picks || []).filter((p) => RC[p.id]);
      const reasons = {}; modelPicks.forEach((p) => { if (p.reason) reasons[p.id] = p.reason; });
      const ids = modelPicks.map((p) => p.id).concat(prods.map((p) => p.id).filter((id) => !modelPicks.some((p) => p.id === id)));
      const noLive = d.intent === 'wardrobe_outfit' || d.limited; // из гардероба и «лимит» — без поиска свежего на WB
      const patch = { text: d.message || 'Готово.', picks: ids.slice(0, 6), allPicks: prods.slice(0, 50).map((p) => p.id), pickReasons: reasons, total: d.total || 0, quick: d.quick || [], liveBusy: !noLive };
      if (d.outfit && d.outfit.items) { RC[d.outfit.id] = d.outfit; patch.outfit = d.outfit; }
      if (!d.outfit && !noLive && (d.intent === 'build_outfit' || /образ/i.test(text))) {
        try { const o = await Api.post('/api/outfits', { count: 1 }); if (o.outfits && o.outfits[0]) patch.outfit = o.outfits[0]; } catch (e) { /* без образа */ }
      }
      if (!finish(patch)) return;
      if (!noLive) enrichLive(mid, text, d, extP, () => relayQid);
    } catch (e) {
      /* нет backend (статический хостинг): локальный демо-мозг */
      try {
        if (e && (e.status !== undefined || e.name === 'AbortError')) throw e; // ошибка сервера или таймаут — показываем ошибку, а не демо
        const b = Demo.brain(text, S.profile);
        b.items.forEach((p) => { RC[p.id] = p; });
        if (!finish({ text: b.message, picks: b.ids.slice(0, 6), allPicks: b.ids, total: b.total, liveBusy: true })) return;
        enrichLive(mid, text, { suggestQuery: text }, extP, () => null, true);
      } catch (de) {
        finish({ text: 'Не получилось связаться со стилистом', error: true });
      }
    }
  };
  /* Свежие товары WB подгружаются ПОСЛЕ ответа и дорисовываются в тот же ответ. */
  async function enrichLive(mid, text, d, extP, getQid, local) {
    const deadline = Date.now() + 75000;
    const live = [];
    const merge = (ids) => { ids.forEach((id) => { if (RC[id] && !live.includes(id)) live.push(id); }); const m = setMsg(mid, { live: live.slice(0, 12) }); if (m && S.lastResult) S.lastResult.live = live.slice(0, 12); };
    const scoreAdd = async (raw) => {
      if (!raw.length) return;
      try { const s = await Api.post('/api/market/score', { items: raw.slice(0, 30), struct: {} }); (s.items || []).forEach((p) => { RC[p.id] = p; }); merge((s.items || []).map((p) => p.id)); }
      catch (e) { const fb = demoFb(); raw.slice(0, 30).forEach((p) => { try { const r = Demo.score(p, S.profile, fb); RC[p.id] = Object.assign({}, p, { aiScore: r.score, aiParts: r.parts }); } catch (x) { /* пропуск */ } }); merge(raw.slice(0, 30).map((p) => p.id)); }
    };
    try { await scoreAdd(await WBClient.searchText(genderQ(d.suggestQuery || text), 50)); } catch (e) { /* WB режет — не страшно */ }
    try { await scoreAdd(await Promise.race([extP, new Promise((res) => setTimeout(() => res([]), Math.max(0, deadline - Date.now())))])); } catch (e) { /* нет расширения */ }
    if (!local) {
      let tries = 0, done = false;
      while (!done && getQid() && Date.now() < deadline && tries < 8) {
        tries++;
        try {
          const rr = await Api.get('/api/live/result?qid=' + encodeURIComponent(getQid()));
          if (rr.data && rr.data.status === 'done') { (rr.data.items || []).forEach((p) => { RC[p.id] = p; }); merge((rr.data.items || []).map((p) => p.id)); done = true; }
        } catch (e) { /* ждём */ }
        if (!done && Date.now() < deadline) await new Promise((res) => setTimeout(res, 8000));
      }
    }
    setMsg(mid, { liveBusy: false }); save();
  }

  /* ---------- страница товара ---------- */
  const LAST_EXT = { id: '', t: 0 };
  function productPage(p, live, rv) {
    const el = document.getElementById('pbody');
    if (!el || S.route !== 'product') return;
    const fav = S.favorites.includes(p.id);
    const need = p.cat === 'shoes' ? S.profile.shoeSize : p.cat === 'bottom' ? S.profile.pantsSize : S.profile.topSize;
    const disc = p.old > p.price ? Math.round((1 - p.price / p.old) * 100) : 0;
    const conf = p.aiConf != null ? p.aiConf : 1;
    el.innerHTML = `
      <div class="gal" style="margin:14px -20px 0;position:relative">${galMain(p)}
        <button class="iconbtn l" style="position:absolute;top:14px;left:14px" onclick="history.length&&S.params&&go('home')" aria-label="Назад">${ic('back', 19)}</button>${galThumbs(p)}</div>
      <div class="row" style="margin-top:14px"><div class="grow">${live ? '<span class="livelabel"><span class="livedot"></span>Live · Wildberries</span>' : `<span class="small muted">${p.mp === 'WB' ? 'Wildberries' : 'Ozon'} · ★ ${p.rating || '—'}</span>`}</div>
        <button class="iconbtn" data-fav="${p.id}" onclick="fav('${p.id}')" aria-label="В избранное" style="${fav ? 'color:#E11D48' : ''}">${ic('heart', 19)}</button>
        <button class="iconbtn" onclick="shareProduct('${p.id}')" aria-label="Поделиться" style="margin-left:8px">${ic('share', 18)}</button></div>
      <h1 style="font-size:21px;margin-top:8px;line-height:1.25">${esc(p.title)}</h1>
      <div class="pricerow"><span class="pn">${fmt(p.price)}</span>${p.old > p.price ? `<s>${fmt(p.old)}</s>` : ''}${disc >= 10 ? `<span class="disc2">−${disc}%</span>` : ''}</div>
      ${live ? `<p class="sub">${esc(p.brand || '')} · размеры на WB: <b style="color:var(--ink)">${(p.sizes || []).slice(0, 6).join(', ')}</b></p>${p.nmId ? `<button class="link" style="padding:4px 0" onclick="copyArt('${p.nmId}')">Артикул WB: <b>${p.nmId}</b> · копировать</button>` : ''}`
        : `<p class="sub">${esc(p.desc || '')}</p><div class="field"><label>Размер · твой ${esc(need)}</label></div><div class="sizes">${(p.sizes || []).map((s) => `<button class="size ${String(s) === String(need) ? 'on' : ''}">${s}</button>`).join('')}</div>`}
      ${p.dataset ? '<p class="sub small">Открытые данные WB (дек 2024): цена и наличие могли измениться.</p>' : ''}
      ${p.legalText ? `<p class="sub small">Реклама · ${esc(p.legalText)}</p>` : ''}
      <div class="scorecard"><div class="ring" style="--p:${p.aiScore || 0}"><b>${p.aiScore || '—'}</b></div>
        <div><p><b>Подходит тебе на ${p.aiScore || '—'}%</b></p><small>${conf < 0.45 ? 'Предварительно: о вещи мало данных.' : 'Считается по твоему профилю, вкусу и гардеробу.'}</small></div></div>
      <div class="why" id="whyrows"><div class="frow"><div class="skel" style="height:44px"></div></div></div>
      <div class="revcard" id="revrow"><div class="revhead"><b>Отзывы</b><span>читаем…</span></div></div>
      <div style="height:20px"></div>
      <div class="stickybar"><div class="sp"><b>${fmt(p.price)}</b><span>${live ? 'цена на момент поиска' : 'WB / Ozon'}</span></div>
        <button class="btn" onclick="market('${p.id}')">Купить ${ic('upRight', 16)}</button></div>`;
    el.querySelectorAll('.size').forEach((b) => { b.onclick = () => { el.querySelectorAll('.size').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }; });
    const back = el.querySelector('.gal .iconbtn.l'); if (back) back.setAttribute('onclick', "go('home')");
    if (live && p.nmId && !(LAST_EXT.id === p.nmId && Date.now() - LAST_EXT.t < 90000)) { LAST_EXT.id = p.nmId; LAST_EXT.t = Date.now(); extOpenProduct(p.nmId); }
    __loadFactors(p.id, !!live);
  }
  window.renderLiveProduct = function (p) { productPage(p, true); };
  window.renderDemoProduct = function (p, rv) { productPage(p, false, rv); };
  window.__loadFactors = async function (id, isLive) {
    const el = document.getElementById('whyrows');
    if (!el || S.route !== 'product') return;
    try {
      let ex;
      if (isLive) ex = (await Api.post('/api/products/explanation', { productId: id, product: RC[id] || null })).data;
      else ex = (await Api.get('/api/products/' + id + '/explanation')).data;
      const rows = (ex.factors || []).filter((f) => f.key !== 'budget');
      el.innerHTML = rows.map((f) => `<div class="frow"><div class="fhead"><b>${esc(f.title)}</b>${f.value == null ? '<span class="na">нет данных</span>' : `<span>${f.value}</span>`}</div>${f.value == null ? '' : `<div class="bar"><i style="width:${Math.max(4, f.value)}%"></i></div>`}<p>${esc(f.text)}</p></div>`).join('')
        + (ex.redundancy ? `<div class="frow"><div class="fhead"><b>Гардероб</b></div><p>${esc(ex.redundancy)}</p></div>` : '');
      const rv = document.getElementById('revrow');
      if (rv && !window.__extBridge) rv.innerHTML = `<div class="revhead"><b>Отзывы</b></div><p class="sub small">Покупательские отзывы читает расширение sainvio — включи его, и здесь появится сводка.</p>`;
      pollReviewComment(id);
    } catch (e) { el.innerHTML = `<div class="frow"><div class="fhead"><b>Не посчиталось</b></div><p>Проверь соединение и зайди снова.</p></div>`; }
  };
  window.pollReviewComment = async function (id) {
    for (let i = 0; i < 12; i++) {
      try {
        const r = await Api.get('/api/products/' + encodeURIComponent(id) + '/review-comment');
        const d = r.data;
        if (d && (d.comment || d.count)) {
          const el = document.getElementById('revrow');
          if (el && S.route === 'product') {
            const sz = d.size || {}, tot = (sz.small || 0) + (sz.ok || 0) + (sz.big || 0);
            const seg = (n, c) => (tot ? `<i class="${c}" style="width:${(n / tot) * 100}%"></i>` : '');
            el.innerHTML = `<div class="revhead"><b>${d.avg != null ? '★ ' + String(d.avg).replace('.', ',') : 'Отзывы'}</b><span>${d.count || 0} отзывов · прочитало расширение</span></div>`
              + (tot ? `<div class="sizebar">${seg(sz.small, 's1')}${seg(sz.ok, 's2')}${seg(sz.big, 's3')}</div><div class="sizelab"><span>маломерит ${sz.small || 0}</span><span>в размер ${sz.ok || 0}</span><span>велико ${sz.big || 0}</span></div>` : '')
              + (d.comment ? `<p class="verdict">${esc(d.comment)}</p>` : '')
              + `<div class="tags">${(d.pros || []).map((x) => `<span class="tag p">${esc(x)}</span>`).join('')}${(d.cons || []).map((x) => `<span class="tag c">${esc(x)}</span>`).join('')}</div>`;
          }
          return;
        }
      } catch (e) { /* ждём */ }
      await new Promise((res) => setTimeout(res, 10000));
      if (!document.getElementById('revrow')) return;
    }
    const el = document.getElementById('revrow');
    if (el) el.innerHTML = `<div class="revhead"><b>Отзывы</b></div><p class="sub small">Пока тихо — загляни на страницу магазина.</p>`;
  };

  /* ---------- образ: свои вещи без «0 ₽» ---------- */
  window.vOutfit = function (id) {
    const o = findOutfit(id);
    if (!o) return `<div class="wrap"><div class="empty"><h3>Образ не найден</h3><button class="btn secondary" onclick="go('home')">Домой</button></div></div>`;
    const items = o.items || [];
    const saved = S.savedOutfits.some((x) => x.id === o.id);
    return `<div class="wrap"><div class="row"><button class="iconbtn" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button></div>
      <h1 class="title" style="margin-top:12px">${esc(o.name)}</h1>
      <p class="sub"><b style="color:var(--ink)">${o.score}%</b> тебе подходит · ${fmt(o.total)}${o.ownCount ? ' · часть вещей уже есть' : ''}</p>
      <div class="ocollage" style="margin-top:14px">${items.map((p) => IM(p.img, p.title)).join('')}</div>
      ${(o.why || []).length ? `<div class="note">${(o.why || []).map((w) => '· ' + esc(w)).join('<br>')}</div>` : ''}
      <div style="margin-top:6px">${items.map((p) => `<div class="kv"><span>${esc(p.title)}</span><b>${p.own ? '<span style="color:var(--ok)">есть у тебя</span>' : fmt(p.price)}</b></div>`).join('')}</div>
      <div style="height:150px"></div>
      <div class="cta">${saved ? `<button class="btn secondary" onclick="go('outfits')">Уже сохранён</button>` : `<button class="btn" onclick="keepOutfit('${o.id}')">${ic('check', 16)} Сохранить образ</button>`}<button class="btn secondary" onclick="shareOutfit('${o.id}')">${ic('share', 16)} Поделиться</button></div></div>`;
  };

  /* ---------- гардероб: форма в нижней шторке ---------- */
  let WSHEET = false;
  window.openWSheet = function () { WSHEET = true; render(); };
  window.closeWSheet = function () { WSHEET = false; render(); };
  window.vWardrobe = function () {
    const w = S.wardrobe, ins = w.insights;
    const form = `<div class="sheetbg" onclick="closeWSheet()"></div><div class="sheet"><div class="grab"></div>
      <div class="row"><h2 class="grow" style="font-size:20px">Новая вещь</h2><button class="iconbtn" onclick="closeWSheet()" aria-label="Закрыть">${ic('x', 18)}</button></div>
      <div class="wrow"><label class="wphoto">${WF.photo ? `<img src="${WF.photo}" alt="">` : ic('camera', 22)}<input type="file" accept="image/*" hidden onchange="wPhoto(event)"></label>
      <input class="input grow" id="w_title" placeholder="Например: чёрное худи" value="${esc(WF.title)}" oninput="WF.title=this.value"></div>
      <div class="chips">${CATS.map(([k, t]) => `<button class="chip ${WF.cat === k ? 'on' : ''}" onclick="wCat('${k}')">${t}</button>`).join('')}</div>
      <div class="field"><label>Цвета (до 2)</label></div>
      <div class="chips">${Object.keys(CDOT).map((c) => `<button class="chip ${WF.colors.includes(c) ? 'on' : ''}" onclick="wCol('${c}')">${dot(c)}${CNAMES[c]}</button>`).join('')}</div>
      <div class="field"><label>Стили (необязательно)</label></div>
      <div class="chips">${STYLES.map(([k, t]) => `<button class="chip ${WF.styles.includes(k) ? 'on' : ''}" onclick="wSty('${k}')">${t}</button>`).join('')}</div>
      <div style="height:16px"></div><button class="btn" onclick="wAdd()">${ic('plus', 16)} Добавить в гардероб</button></div>`;
    return `<div class="wrap">
      <div class="row"><button class="iconbtn" onclick="go('home')" aria-label="Назад">${ic('back', 19)}</button><div class="grow"><h1 class="title" style="font-size:24px">Мой гардероб</h1></div>
      <button class="iconbtn" style="background:var(--ink);color:#fff;border-color:var(--ink)" onclick="openWSheet()" aria-label="Добавить вещь">${ic('plus', 20)}</button></div>
      ${ins && ins.count ? `<div class="note"><b>Что видит AI.</b> ${esc(ins.note)}<div class="row" style="margin-top:10px;gap:6px">${ins.colors.map(dot).join('')}<span class="small muted" style="margin-left:4px">${ins.styles.map((s) => (STYLES.find(([k]) => k === s) || [])[1] || s).join(' · ')}</span></div></div>`
        : `<div class="note">Добавь 3–5 любимых вещей — AI поймёт твой вкус, а образы начнёт собирать вокруг них.</div>`}
      <div class="sect big"><div><h2>Вещи · ${w.items.length}</h2></div></div>
      ${w.items.length ? `<div class="wgrid">${w.items.map((it) => `<div class="wcard"><span class="wph">${it.photo ? `<img src="${it.photo}" alt="">` : `<span class="dotbig"><i style="background:${CDOT[(it.colors || [])[0]] || '#ccc'}"></i></span>`}</span>
        <div class="wi"><b>${esc(it.title)}</b><span class="muted">${(CATS.find(([k]) => k === it.cat) || [])[1] || ''}</span></div>
        <button class="wdel" onclick="wDel('${it.id}')" aria-label="Убрать">${ic('trash', 16)}</button></div>`).join('')}</div>`
        : `<div class="empty"><div class="eic">${ic('hanger', 26)}</div><h3>Пока пусто</h3><p class="small">Добавь первую вещь — нажми «+» вверху.</p><div style="height:12px"></div><button class="btn" onclick="openWSheet()">Добавить вещь</button></div>`}
      <div style="height:20px"></div>${WSHEET ? form : ''}</div>`;
  };
  const __wAdd = window.wAdd;
  window.wAdd = async function () {
    const before = S.wardrobe.items.length;
    await __wAdd();
    if (S.wardrobe.items.length > before) { WSHEET = false; render(); }
  };
})();
