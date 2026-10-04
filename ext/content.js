'use strict';
/* content.js — выполняется ВНУТРИ вкладки wildberries.ru.
   fetch отсюда идёт с origin сайта + его куками: для wbaas это
   обычный запрос самого сайта, а не скрипта/расширения. */
/* Режим человека: печатаем запрос в строку поиска как живой пользователь
   (побуквенно, с паузами), ждём выдачу, считываем карточки из DOM.
   Для wbaas неотличимо от ручного поиска. ~10с на запрос. */
const HSLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
function findSearchInput() {
  return document.querySelector('#searchInput')
    || document.querySelector('input[type="search"]')
    || [...document.querySelectorAll('input')].find((i) => /найти|поиск/i.test((i.placeholder || '') + (i.getAttribute('aria-label') || '')))
    || null;
}
function findCards() {
  const sels = ['.product-card', '.product-card__wrapper', '[data-card-index]'];
  for (const s of sels) {
    const els = [...document.querySelectorAll(s)].filter((el) => el.querySelector('a[href*="/catalog/"]'));
    if (els.length >= 5) return els;
  }
  return [];
}
function readCard(el) {
  try {
    const a = el.querySelector('a[href*="/catalog/"]');
    if (!a) return null;
    const m = a.href.match(/\/catalog\/(\d+)/);
    if (!m) return null;
    const id = +m[1];
    const img = el.querySelector('img');
    /* Берём самый большой кандидат из srcset — его заявил сам WB, он существует.
       Никаких подмен tm→big: сконструированные URL — главный источник битых фото. */
    let src = '';
    try {
      const ss = img ? (img.getAttribute('srcset') || '') : '';
      if (ss) {
        const parts = ss.split(',').map((s) => s.trim().split(/\s+/)[0]).filter((u) => u && !u.startsWith('data:'));
        if (parts.length) src = parts[parts.length - 1];
      }
    } catch (e) {}
    if (!src && img) src = img.currentSrc || img.src || img.dataset.src || img.getAttribute('data-src') || '';
    if (src && src.startsWith('/')) { try { src = new URL(src, location.href).href; } catch (e) { src = ''; } }
    /* Отсекаем заглушки ленивой загрузки: data-пиксели, стабы, короткие ссылки. */
    if (!src || src.startsWith('data:') || src.length < 20
      || /stub|placeholder|pixel|blank|1x1|lazy/i.test(src)) src = '';
    const title = (img && img.alt) || (el.querySelector('.product-card__name') || {}).textContent || '';
    const priceEl = el.querySelector('.price__lower-price') || el.querySelector('ins') || el.querySelector('.lower-price');
    const price = priceEl ? parseInt(String(priceEl.textContent).replace(/[^\d]/g, '')) || 0 : 0;
    if (!title.trim() || !price) return null;
    return { id, title: title.trim().slice(0, 120), price, img: src };
  } catch (e) { return null; }
}
async function humanSearch(query, opts) {
  const fast = !!(opts && opts.fast);
  const input = findSearchInput();
  if (!input) throw new Error('нет строки поиска на странице');
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (const ch of query) {
    input.value += ch;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch }));
    await HSLEEP(60 + Math.random() * 130);
  }
  await HSLEEP(600);
  const form = input.closest('form');
  if (form && form.requestSubmit) form.requestSubmit();
  else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
  let cards = [];
  for (let i = 0; i < 15; i++) {
    await HSLEEP(1000);
    cards = findCards();
    if (cards.length >= 10) break;
  }
  /* Ленивая загрузка: без прокрутки половина img — пустышки (data:),
     и сборщик уносит мусор вместо фото. Скроллим всю выдачу ступенями.
     fast (полоса под запрос): верха достаточно, скролл пропускаем. */
  try {
    /* Хватает и верха выдачи: дальше 15 карточек уже есть — не скроллим. */
    if (!fast && findCards().length < 15) {
      const h = document.body.scrollHeight;
      for (let s = 1; s <= 3; s++) {
        window.scrollTo(0, Math.round((h / 3) * s));
        await HSLEEP(700);
        if (findCards().length >= 25) break;
      }
      window.scrollTo(0, 0);
      await HSLEEP(400);
    }
  } catch (e) {}
  cards = findCards();
  return cards.slice(0, 30).map(readCard).filter(Boolean);
}
/* Отзывы карточки: 3 прохода — JSON-LD, точные селекторы, generic-скан.
   Возвращает {reviews, via} — видно, каким путём нашло (для диагностики). */
function reviewsFromLd() {
  const out = [];
  try {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const j = JSON.parse(s.textContent || '');
        const arr = Array.isArray(j) ? j : [j];
        arr.forEach((o) => {
          const rv = (o && o.review) || [];
          (Array.isArray(rv) ? rv : [rv]).forEach((r) => {
            if (!r) return;
            const text = String(r.reviewBody || r.text || '').replace(/\s+/g, ' ').trim();
            let rating = 0;
            try { rating = parseInt(((r.reviewRating || {}).ratingValue) || 0, 10) || 0; } catch (e) {}
            if (text.length >= 15) out.push({ text: text.slice(0, 500), rating });
          });
        });
      } catch (e) {}
    });
  } catch (e) {}
  return out;
}
function ratingNear(el) {
  try {
    const scope = el.closest ? (el.closest('[class*="feedback"],[class*="comment"],[class*="review"],li,article,div') || el) : el;
    const cand = [
      scope.querySelector('.comment__rating'), scope.querySelector('.feedback__rating'),
      scope.querySelector('[class*="star"]'), scope.querySelector('[aria-label*="ценк"]'),
      scope.querySelector('[aria-label*="звезд"]')
    ].filter(Boolean)[0];
    if (cand) {
      const m = String(cand.getAttribute('class') + ' ' + cand.getAttribute('aria-label') + ' ' + (cand.textContent || '')).match(/([1-5])/);
      if (m) return +m[1];
    }
    const t = String((scope.innerText || scope.textContent || '')).slice(0, 300);
    const m2 = t.match(/оценка\s*([1-5])/i);
    if (m2) return +m2[1];
  } catch (e) {}
  return 0;
}
async function scrapeReviews() {
  const ld = reviewsFromLd().slice(0, 30);
  if (ld.length >= 5) return { reviews: ld, via: 'ld' };
  const pick = (sels) => {
    for (const s of sels) {
      try { const els = [...document.querySelectorAll(s)]; if (els.length) return { els, sel: s }; } catch (e) {}
    }
    return { els: [], sel: '' };
  };
  try {
    const head = [...document.querySelectorAll('h1,h2,h3')].find((h) => /отзыв/i.test(h.textContent || ''));
    if (head) { head.scrollIntoView({ block: 'start' }); await HSLEEP(1500); }
  } catch (e) {}
  /* Кнопка «показать ещё» — догружаем ленту отзывов. */
  try {
    const more = [...document.querySelectorAll('button,a')].find((b) => /показать.*отзыв|все.*отзыв|ещё.*\d+|загрузить/i.test((b.textContent || '').slice(0, 60)));
    if (more) { more.click(); await HSLEEP(2000); }
  } catch (e) {}
  for (let i = 0; i < 5; i++) {
    try { window.scrollBy(0, 1000); } catch (e) {}
    await HSLEEP(1100);
  }
  const out = [], seen = new Set();
  const push = (t, el) => {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length < 15 || t.length > 1200 || seen.has(t.slice(0, 60))) return;
    seen.add(t.slice(0, 60));
    out.push({ text: t.slice(0, 500), rating: el ? ratingNear(el) : 0 });
  };
  const found = pick(['.comment__text', '.feedback__text', '.feedback__content', '[data-testid="feedback-text"]', '.comments-list__text', '.comment-text', '.review-text']);
  if (found.els.length) {
    found.els.slice(0, 60).forEach((el) => push(el.innerText || el.textContent, el));
    if (out.length) return { reviews: out.slice(0, 30), via: 'dom:' + found.sel };
  }
  /* Generic: любой блок с классом про отзывы/комменты. */
  try {
    const all = [...document.querySelectorAll('[class]')].filter((el) => {
      const c = String(el.getAttribute('class') || '');
      return /comment|feedback|review|opinion|otzyv/i.test(c) && !/list|container|wrapper|section|block|wrap/i.test(c);
    });
    all.slice(0, 80).forEach((el) => push(el.innerText || el.textContent, el));
    if (out.length) return { reviews: out.slice(0, 30), via: 'generic' };
  } catch (e) {}
  if (ld.length) return { reviews: ld, via: 'ld-few' };
  return { reviews: [], via: 'none' };
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'wbPing') { sendResponse({ ok: true }); return; }
  if (msg && msg.type === 'scrapeReviews') {
    scrapeReviews()
      .then((r) => sendResponse({ ok: true, reviews: r.reviews || [], via: r.via || '?' }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg && msg.type === 'humanSearch') {
    humanSearch(msg.query, { fast: !!msg.fast })
      .then((items) => sendResponse({ ok: true, items }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg && msg.type === 'wbFetch') {
    fetch(msg.url)
      .then(async (r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        sendResponse({ ok: true, data: await r.json() });
      })
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // асинхронный ответ
  }
});
