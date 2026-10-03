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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'wbPing') { sendResponse({ ok: true }); return; }
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
