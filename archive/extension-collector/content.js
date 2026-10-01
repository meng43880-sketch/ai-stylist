'use strict';
/* content.js — работает на странице товара WB/Ozon. Ничего не отправляет сам:
   только ЧИТАЕТ открытую пользователем страницу и отдаёт данные по запросу
   из popup (пользователь явно жмёт «Сохранить»). */
function firstJsonLd() {
  const out = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    try {
      const j = JSON.parse(el.textContent);
      (Array.isArray(j) ? j : [j]).forEach((x) => {
        if (!x) return;
        const g = x['@graph'] || [x];
        g.forEach((n) => { if (n && (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product')))) out.push(n); });
      });
    } catch (e) {}
  });
  return out[0] || null;
}
function meta(prop) {
  const el = document.querySelector(`meta[property="${prop}"],meta[name="${prop}"]`);
  return el ? (el.content || '') : '';
}
function firstText(rx, maxLen) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (t.length > 3 && t.length < 80 && rx.test(t)) return t.slice(0, maxLen || 60);
  }
  return '';
}
function parsePage() {
  const url = location.href.split('?')[0];
  const isWb = /wildberries\.ru/.test(url);
  const isOzon = /ozon\.ru/.test(url);
  if (!isWb && !isOzon) return { ok: false, error: 'Открой карточку товара на WB или Ozon' };
  const ld = firstJsonLd();
  const offers = ld && ld.offers ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) : null;
  const agg = ld && ld.aggregateRating;
  const title = (ld && ld.name) || meta('og:title') || document.title || '';
  const img = (ld && (Array.isArray(ld.image) ? ld.image[0] : ld.image)) || meta('og:image') || '';
  const brand = (ld && ld.brand && (ld.brand.name || ld.brand)) || '';
  const priceRaw = (offers && (offers.price || offers.lowPrice)) || meta('product:price:amount') || '';
  const price = Math.round(parseFloat(String(priceRaw).replace(/[^\d.,]/g, '').replace(',', '.'))) || 0;
  const rating = agg ? parseFloat(agg.ratingValue) || 0 : 0;
  const reviews = agg ? parseInt(agg.reviewCount) || 0 : 0;
  const colorHit = firstText(/цвет\s*:/i, 40);
  const color = colorHit ? colorHit.replace(/.*цвет\s*:/i, '').trim() : '';
  if (!title) return { ok: false, error: 'Не нашёл название товара на странице' };
  if (!price) return { ok: false, error: 'Не нашёл цену — дождись загрузки карточки' };
  return {
    ok: true,
    product: {
      url, title: title.slice(0, 120), price,
      img: String(img).slice(0, 500), brand: String(brand).slice(0, 40),
      colors: color ? [color] : [], rating, reviews
    }
  };
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'parse') {
    try { sendResponse(parsePage()); } catch (e) { sendResponse({ ok: false, error: 'Не получилось прочитать страницу' }); }
  }
  if (msg && msg.action === 'autopilot') {
    autopilotLoop(msg.cmd || {}).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (msg && msg.action === 'apstate') {
    chrome.storage.local.get(['ap'], (d) => sendResponse({ ok: true, ap: d.ap || null }));
    return true;
  }
  return true;
});

/* ---------- Автопилот: обход выдачи WB, паузы, стоп по капче ----------
   Работает в ТВОЁМ браузере с ТВОИМ IP (WB его пускает). Вежливо: паузы
   2–5 сек между страницами, стоп при капче/пустых страницах/команде. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
function captchaHere() {
  const t = (document.body && document.body.innerText || '').slice(0, 2000);
  return /капча|captcha|подтвердите,?\s*что вы не робот|введите код с картинки/i.test(t);
}
function collectCards() {
  const out = [], seen = new Set();
  document.querySelectorAll('a[href*="/catalog/"]').forEach((a) => {
    const m = (a.getAttribute('href') || '').match(/\/catalog\/(\d{5,})/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    const box = a.closest('div') || a;
    const img = box.querySelector('img');
    const src = img ? (img.currentSrc || img.src || '') : '';
    const txt = (box.innerText || '').replace(/\s+/g, ' ').slice(0, 300);
    const pr = txt.match(/([\d\s]{3,})\s*₽/);
    const title = (img && img.alt) || a.getAttribute('aria-label') || txt.split('₽').pop() || '';
    if (!title || title.length < 4) return;
    out.push({
      url: 'https://www.wildberries.ru/catalog/' + m[1] + '/detail.aspx',
      title: title.trim().slice(0, 120),
      price: pr ? parseInt(pr[1].replace(/\s/g, '')) || 0 : 0,
      img: src.startsWith('http') ? src.slice(0, 500) : '', brand: ''
    });
  });
  return out.filter((c) => c.price > 0);
}
async function apGet() {
  return new Promise((res) => chrome.storage.local.get(['ap', 'base', 'token'], (d) => res(d)));
}
async function apSet(patch) {
  const d = await apGet();
  await new Promise((res) => chrome.storage.local.set({ ap: Object.assign({}, d.ap, patch) }, res));
}
async function apPost(path, body, base, token) {
  const r = await fetch(base.replace(/\/$/, '') + path, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j;
}
async function autopilotLoop(cmd) {
  if (cmd.stop) { await apSet({ running: false, note: 'Остановлен вручную' }); return { ok: true }; }
  const target = Math.min(500, Math.max(10, parseInt(cmd.target) || 200));
  let st = (await apGet()).ap || {};
  await apSet({ running: true, target, done: st.done || 0, errors: 0, note: 'Работаю…', page: st.page || 1, emptyPages: 0 });
  let emptyPages = st.emptyPages || 0;
  for (;;) {
    const cur = (await apGet()).ap || {};
    if (cur.running === false) return { ok: true, stopped: true };
    if ((cur.done || 0) >= target) { await apSet({ running: false, note: 'Готово: ' + cur.done }); return { ok: true, done: true }; }
    if (captchaHere()) { await apSet({ running: false, note: 'Стоп: похоже на капчу. Подожди и продолжи позже' }); return { ok: true, captcha: true }; }
    const cards = collectCards().filter((c) => !(cur.seen || {})[c.url]);
    if (!cards.length) {
      emptyPages++;
      if (emptyPages >= 3) { await apSet({ running: false, note: 'Готово: страницы кончились (' + (cur.done || 0) + ')' }); return { ok: true, done: true }; }
    } else emptyPages = 0;
    const { base, token } = await apGet();
    let saved = 0;
    for (const c of cards.slice(0, 40)) {
      const now = (await apGet()).ap || {};
      if (now.running === false) return { ok: true, stopped: true };
      try {
        await apPost('/api/collect', c, base, token);
        saved++;
        const upd = (await apGet()).ap || {};
        const seen = Object.assign({}, upd.seen, { [c.url]: 1 });
        await apSet({ done: (upd.done || 0) + 1, seen });
      } catch (e) {
        const upd = (await apGet()).ap || {};
        await apSet({ errors: (upd.errors || 0) + 1, note: 'Ошибка: ' + String(e.message || e).slice(0, 80) });
        if (/429|50 товаров|лимит/i.test(String(e.message))) { await apSet({ running: false, note: 'Стоп: дневной лимит' }); return { ok: true, limited: true }; }
      }
      await sleep(rnd(400, 900));
    }
    if ((cur.done || 0) + saved >= target) { await apSet({ running: false, note: 'Готово: ' + ((cur.done || 0) + saved) }); return { ok: true, done: true }; }
    await sleep(rnd(2500, 5000));
    // следующая страница: клик «далее» или ?page=N
    const next = document.querySelector('a[class*="next" i], a[rel="next"], a.pagination__next');
    const u = new URL(location.href);
    if (next && next.href && !/javascript/i.test(next.href)) { location.href = next.href; return { ok: true, navigated: true }; }
    const p = parseInt(u.searchParams.get('page') || '1') + 1;
    u.searchParams.set('page', String(p));
    await apSet({ page: p, emptyPages });
    location.href = u.toString();
    return { ok: true, navigated: true };
  }
}
// авто-продолжение после перехода на следующую страницу
(async () => {
  try {
    const d = await new Promise((res) => chrome.storage.local.get(['ap'], res));
    if (d.ap && d.ap.running && /wildberries\.ru/.test(location.href)) {
      await sleep(3000);
      const cur = await new Promise((res) => chrome.storage.local.get(['ap'], res));
      if (cur.ap && cur.ap.running) autopilotLoop({});
    }
  } catch (e) {}
})();
