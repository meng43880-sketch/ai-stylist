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
/* AI-сводка WB — не отзыв: «нейросеть», «по мнению покупателей» и т.п. */
const RV_SUMMARY_RX = /нейросеть|по мнению покупателей|в двух словах|\bсводка\b|ai-сводка/i;
const RV_SELLER_RX = /ответ продавца|официальный представитель/i;
function summaryRoots() {
  const roots = [];
  try {
    document.querySelectorAll('div,section,aside').forEach((el) => {
      const t = String((el.innerText || '').split('\n')[0] || '').slice(0, 140);
      if (t.length > 10 && RV_SUMMARY_RX.test(t)) roots.push(el);
    });
  } catch (e) {}
  return roots;
}
function inRoots(el, roots) {
  try { for (const r of roots) if (r.contains(el)) return true; } catch (e) {}
  return false;
}
function sellerScope(el) {
  try {
    const scope = el.closest ? (el.closest('[class*="feedback"],[class*="comment"],li,article') || el) : el;
    if (scope.querySelector('[class*="seller"],[class*="answer"],[class*="merchant"]')) return true;
    const t = String((scope.innerText || scope.textContent || '')).slice(0, 250);
    if (RV_SELLER_RX.test(t)) return true;
  } catch (e) {}
  return false;
}
function ratingInScope(scope) {
  /* 1) явные data-атрибуты */
  const rated = scope.querySelector('[data-rate],[data-rating],[data-score],[data-stars]');
  if (rated) {
    const v = parseInt(rated.getAttribute('data-rate') || rated.getAttribute('data-rating') || rated.getAttribute('data-score') || rated.getAttribute('data-stars'), 10);
    if (v >= 1 && v <= 5) return v;
  }
  /* 2) оценка зашита в класс WB: «stars-line star5».
     Правило безопасности: берём цифру, только если она одна во всём
     скоупе. Звёзды-позиции (star1..star5 в линейке) дадут набор
     1..5 — такой скоуп пропускаем, иначе всегда вернули бы 1. */
  try {
    const hits = [];
    const nodes = [scope].concat([...scope.querySelectorAll('[class]')].slice(0, 120));
    for (const e of nodes) {
      const c = String(e.getAttribute('class') || '');
      const m = c.match(/\bstar(?:s)?[-_ ]?([1-5])\b/i) || c.match(/\b(?:rating|rate|grade|score|count)[-_ ]?([1-5])\b/i);
      if (m) hits.push({ v: +m[1], c: c });
    }
    if (hits.length) {
      const own = hits.filter((h) => /line|rating|rate|grade|score|count/i.test(h.c));
      const digits = [...new Set((own.length ? own : hits).map((h) => h.v))];
      if (digits.length === 1 && digits[0] >= 1 && digits[0] <= 5) return digits[0];
    }
  } catch (e) {}
  /* 3) считаем закрашенные звёзды внутри карточки */
  const stars = [...scope.querySelectorAll('[class*="star"]')].filter((s) => !s.querySelector('[class*="star"]'));
  if (stars.length >= 3 && stars.length <= 10) {
    const filled = stars.filter((s) => /fill|active|\bon\b|full|selected|checked|rated|grade/i.test(String(s.getAttribute('class') || ''))).length;
    if (filled >= 1 && filled <= 5) return filled;
    /* 3b) заливка SVG берётся только из явного fill-атрибута:
       у обычного span computed fill всегда чёрный — это давало
       ложные пятёрки. */
    try {
      let withFill = 0, filledCnt = 0;
      for (const s of stars) {
        const shape = s.querySelector('path,polygon,circle,use');
        const f = String((shape || s).getAttribute('fill') || '');
        if (!f) continue;
        withFill++;
        if (!/^(none|transparent|rgba?\(0,\s*0,\s*0,\s*0\)|#(?:fff|ffffff|e0e0e0|d8d8d8|c7c7c7|c9c9c9|cccccc|f0f0f0|ededed|e5e5e5))$/i.test(f)) filledCnt++;
      }
      if (withFill >= 3 && filledCnt >= 1 && filledCnt <= 5) return filledCnt;
    } catch (e) {}
  }
  /* 4) aria-подписи */
  const lab = scope.querySelector('[aria-label*="ценк"],[aria-label*="звезд"],[aria-label*="оценк"]');
  if (lab) {
    const m = String(lab.getAttribute('aria-label') || '').match(/([1-5])/);
    if (m) return +m[1];
  }
  /* 5) запасной вариант: явная «оценка N» / «N из 5» / «★N» текстом */
  const t = String((scope.innerText || scope.textContent || '')).slice(0, 300);
  const m2 = t.match(/оценка\s*([1-5])/i) || t.match(/([1-5])\s*из\s*5/) || t.match(/рейтинг\s*([1-5])/i) || t.match(/★\s*([1-5])/);
  if (m2) return +m2[1];
  return 0;
}
function ratingFromStars(el) {
  try {
    /* Тесный скоуп первым (сам блок отзыва), потом вверх по предкам —
       так звёзды-соседи текста находятся уже на 1-2 уровне. */
    const scopes = [];
    const tight = el.closest ? el.closest('[class*="feedback"],[class*="comment"],[class*="review"],[class*="rating"],li,article') : null;
    if (tight) scopes.push(tight);
    let p = el;
    for (let i = 0; i < 5 && p; i++) { scopes.push(p); p = p.parentElement; }
    const seen = new Set();
    for (const scope of scopes) {
      if (!scope || seen.has(scope)) continue;
      seen.add(scope);
      const v = ratingInScope(scope);
      if (v) return v;
    }
  } catch (e) {}
  return 0;
}
function helpfulNear(el) {
  try {
    const scope = el.closest ? (el.closest('[class*="feedback"],[class*="comment"],li,article') || el) : el;
    const t = String((scope.innerText || scope.textContent || '')).slice(0, 600);
    const m = t.match(/полезно\D{0,12}(\d{1,4})|(\d{1,4})\D{0,12}полезно/i);
    if (m) return parseInt(m[1] || m[2], 10) || 0;
  } catch (e) {}
  return 0;
}
async function scrapeReviews() {
  const debug = { title: String(document.title || '').slice(0, 80), tabClicked: false };
  const ld = reviewsFromLd().slice(0, 30);
  if (ld.length >= 5) return { reviews: ld, via: 'ld', debug };
  const pick = (sels) => {
    for (const s of sels) {
      try { const els = [...document.querySelectorAll(s)]; if (els.length) return { els, sel: s }; } catch (e) {}
    }
    return { els: [], sel: '' };
  };
  try {
    const tab = [...document.querySelectorAll('button,a,[role="tab"]')].find((b) => (
      /отзыв/i.test((b.textContent || '').slice(0, 40)) && !/показать|все/i.test((b.textContent || '').slice(0, 40))
    ));
    if (tab) { tab.click(); debug.tabClicked = true; await HSLEEP(2000); }
  } catch (e) {}
  try {
    const head = [...document.querySelectorAll('h1,h2,h3')].find((h) => /отзыв/i.test(h.textContent || ''));
    if (head) { head.scrollIntoView({ block: 'start' }); await HSLEEP(1500); }
  } catch (e) {}
  const out = [], seen = new Set();
  const sumRoots = summaryRoots();
  const hasSummary = sumRoots.length > 0;
  /* Отсекаем не-отзывы: вопросы, кнопки, служебные фразы, AI-сводку WB,
     ответы продавца — иначе AI врёт по мусору. */
  const JUNK = /^(показать|ответить|пожаловаться|полезно|не полезно|написать|свернуть|развернуть|ещё|еще|все|читать)/i;
  const push = (t, el) => {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length < 25 || t.length > 1200 || seen.has(t.slice(0, 60))) return;
    if (JUNK.test(t) || /\?$/.test(t)) return;
    if (RV_SUMMARY_RX.test(t.slice(0, 200))) return;
    if (el && (inRoots(el, sumRoots) || sellerScope(el))) return;
    seen.add(t.slice(0, 60));
    out.push({ text: t.slice(0, 500), rating: el ? ratingFromStars(el) : 0, helpful: el ? helpfulNear(el) : 0, ord: out.length });
  };
  const collectOnce = () => {
    const found = pick(['.comment__text', '.feedback__text', '.feedback__content', '[data-testid="feedback-text"]', '.comments-list__text', '.comment-text', '.review-text']);
    if (found.els.length) {
      found.els.slice(0, 80).forEach((el) => push(el.innerText || el.textContent, el));
      if (out.length >= 5) return 'dom:' + found.sel;
    }
    try {
      let all = [...document.querySelectorAll('[class]')].filter((el) => {
        const c = String(el.getAttribute('class') || '');
        /* ОСТОРОЖНО: 'list'/'block' убивают comments-list__item и feedback-block —
           исключаем только явные обёртки страницы. */
        return /comment|feedback|review|opinion|otzyv/i.test(c) && !/container|wrapper|section|wrap|page|modal|header|footer/i.test(c);
      });
      /* Leaf-only: родитель, внутри которого есть другой кандидат, — не отзыв,
         иначе склеиваются соседние карточки. */
      const set = new Set(all);
      all = all.filter((el) => {
        for (const o of set) if (o !== el && el.contains(o)) return false;
        return true;
      });
      all.slice(0, 140).forEach((el) => push(el.innerText || el.textContent, el));
      if (out.length >= 5) return 'generic';
    } catch (e) {}
    return '';
  };
  /* Догрузка циклами: кнопка «ещё» (любой тег) + скролл окна и контейнера. */
  const clickMore = () => {
    try {
      const cands = [...document.querySelectorAll('button,a,div,span')].filter((b) => {
        const t = (b.innerText || b.textContent || '').trim();
        if (t.length > 60 || t.length < 3) return false;
        return /отзыв/i.test(t) && /показать|все|ещё|больше|загрузить|далее/i.test(t);
      });
      cands.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
      if (cands[0]) { cands[0].click(); return true; }
    } catch (e) {}
    return false;
  };
  const scrollReviews = async () => {
    try {
      const head = [...document.querySelectorAll('h1,h2,h3')].find((h) => /отзыв/i.test(h.textContent || ''));
      let box = head ? head.parentElement : null;
      let guard = 0;
      while (box && guard++ < 6) {
        try {
          const cs = window.getComputedStyle(box);
          if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && box.scrollHeight > box.clientHeight + 50) {
            box.scrollTop = box.scrollHeight;
            await HSLEEP(1200);
            box.scrollTop = 0;
            return;
          }
        } catch (e) {}
        box = box.parentElement;
      }
    } catch (e) {}
    for (let i = 0; i < 4; i++) {
      try { window.scrollBy(0, 1000); } catch (e) {}
      await HSLEEP(1000);
    }
  };
  let via = collectOnce();
  /* Даже если что-то нашлось — пробуем догрузить: останавливаемся,
     только когда число перестало расти (макс. 4 круга). */
  for (let round = 0; round < 4 && out.length < 30; round++) {
    const before = out.length;
    clickMore();
    await HSLEEP(1500);
    await scrollReviews();
    via = collectOnce() || via;
    if (out.length <= before) break;
  }
  /* Выборка: самые полезные + начало и конец ленты + низкие оценки —
     иначе видим только первую страницу сортировки по умолчанию. */
  const sampleReviews = (arr) => {
    const useful = [...arr].sort((a, b) => (b.helpful || 0) - (a.helpful || 0)).slice(0, 12);
    const head = arr.slice(0, 12);
    const tail = arr.slice(-6);
    const low = arr.filter((r) => r.rating >= 1 && r.rating <= 2).slice(0, 6);
    const got = new Set(), res = [];
    [useful, head, tail, low].forEach((g) => g.forEach((r) => {
      const k = String(r.text || '').slice(0, 60);
      if (!got.has(k)) { got.add(k); res.push(r); }
    }));
    return res.slice(0, 30);
  };
  const rateFlag = (arr) => {
    const rated = arr.filter((r) => (r.rating || 0) > 0).length;
    return { rated, ratingsOk: arr.length > 0 && rated >= Math.max(2, Math.ceil(arr.length * 0.4)) };
  };
  if (out.length) {
    const smp = sampleReviews(out);
    return Object.assign({ reviews: smp, via: via || 'generic', debug, hasSummary }, rateFlag(smp));
  }
  if (ld.length) return { reviews: ld, via: 'ld-few', debug, hasSummary };
  let bodyHas = false, candCount = 0;
  try {
    bodyHas = /отзыв/i.test(document.body ? document.body.innerText.slice(0, 20000) : '');
    candCount = document.querySelectorAll('[class*="comment"],[class*="feedback"],[class*="review"]').length;
  } catch (e) {}
  return { reviews: [], via: 'none', debug: Object.assign(debug, { bodyHasOtzyv: bodyHas, candCount }) };
}
/* Слепок разметки отзывов: когда оценки не распознались, лог покажет
   реальные классы — по ним чиним селекторы без гаданий. */
function probeReviewDOM() {
  const out = { cls: {}, stars: [], rateCls: [], card: '' };
  try {
    const els = [...document.querySelectorAll('[class]')].filter((el) => /comment|feedback|review|opinion|otzyv|star|rate|grade|valuation|score/i.test(String(el.getAttribute('class') || '')));
    els.slice(0, 400).forEach((el) => {
      String(el.getAttribute('class') || '').split(/\s+/).forEach((c) => {
        if (/comment|feedback|review|opinion|otzyv|star|rate|grade|valuation|score/i.test(c)) out.cls[c] = (out.cls[c] || 0) + 1;
      });
    });
    /* Классы с цифрой оценки — именно по ним чинится детект. */
    const RATE_RX = /\bstar(?:s)?[-_ ]?[1-5]\b|\b(?:rating|rate|grade|score|count)[-_ ]?[1-5]\b/i;
    document.querySelectorAll('[class]').forEach((el) => {
      const c = String(el.getAttribute('class') || '');
      const m = c.match(RATE_RX);
      if (m && out.rateCls.length < 20) out.rateCls.push(m[0] + ' @ ' + c.slice(0, 70));
    });
    /* Звёзды берём только внутри блоков отзывов — баннеры мешают. */
    const fbRoots = [...document.querySelectorAll('[class*="feedbackItem"],[class*="feedback__"],[class*="comment"]')].slice(0, 6);
    const starSrc = fbRoots.length ? fbRoots : [...document.querySelectorAll('[class*="star"]')].slice(0, 6);
    starSrc.forEach((root) => {
      [...root.querySelectorAll('[class*="star"]')].slice(0, 4).forEach((s) => {
        if (out.stars.length >= 8) return;
        let fill = '';
        try {
          const shape = s.querySelector('path,polygon,circle,use') || s;
          fill = String(shape.getAttribute('fill') || (window.getComputedStyle ? window.getComputedStyle(shape).fill : '') || '');
        } catch (e) {}
        out.stars.push(String(s.getAttribute('class') || '').slice(0, 80) + ' | fill=' + fill.slice(0, 40) + ' | txt=' + String(s.textContent || '').slice(0, 12));
      });
    });
    /* Карточка отзыва — ищем по блоку, а не первый попавшийся элемент. */
    const card = document.querySelector('[class*="feedbackItemBlock"],[class*="feedback__item"],[class*="comment__item"],[class*="feedbackItemWrap"]')
      || els.find((el) => (el.innerText || '').length > 60) || els[0];
    if (card) out.card = (String(card.getAttribute('class') || '') + ' >> ' + String(card.outerHTML || '').replace(/\s+/g, ' ')).slice(0, 700);
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'wbPing') { sendResponse({ ok: true }); return; }
  if (msg && msg.type === 'probeReviews') {
    try { sendResponse({ ok: true, probe: probeReviewDOM() }); } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    return;
  }
  if (msg && msg.type === 'scrapeReviews') {
    scrapeReviews()
      .then((r) => sendResponse({ ok: true, reviews: r.reviews || [], via: r.via || '?', debug: r.debug || null, ratingsOk: r.ratingsOk !== false, hasSummary: !!r.hasSummary }))
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
