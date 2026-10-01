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
  return true;
});
