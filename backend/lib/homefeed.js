'use strict';
/* homefeed.js — «домашний мост»: каталог, собранный скриптом collector/ на
   домашнем ПК (жилой IP), и запушенный на сервер через POST /api/collector/push.
   Хранение: backend/data/homefeed.json (gitignore, на Render эфемерно — мост
   перепушивает сам; без свежих данных выдача молча пустеет, ничего не падает).
   Рубильник: COLLECTOR_ENABLED=true, иначе мост полностью выключен (откат
   без нового деплоя кода — достаточно сменить env на Render). */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'homefeed.json');
const MAX_AGE_MS = 24 * 3600 * 1000; // свежее суток — годное
const MAX_ITEMS = 1500;
function enabled() { return (process.env.COLLECTOR_ENABLED || '').toLowerCase() === 'true'; }
function read() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (j && Array.isArray(j.items)) return j;
  } catch {}
  return { items: [], ts: 0 };
}
function getItems() {
  if (!enabled()) return [];
  const j = read();
  if (!j.items.length) return [];
  if (Date.now() - (j.ts || 0) > MAX_AGE_MS) return []; // протухло — не показываем
  return j.items;
}
function stats() {
  const j = read();
  return { enabled: enabled(), count: j.items.length, ts: j.ts || 0, ageMin: j.ts ? Math.round((Date.now() - j.ts) / 60000) : -1, fresh: enabled() && j.items.length > 0 && (Date.now() - (j.ts || 0) <= MAX_AGE_MS) };
}
/* Санитизация пуша: только известные поля, лимиты длин — коллектор свой,
   но паранойя дешёвая. */
const PICK = ['id', 'nmId', 'title', 'brand', 'price', 'old', 'oldPrice', 'currency', 'img', 'imageUrl', 'mp', 'cat', 'category', 'colors', 'sizes', 'styles', 'fit', 'rating', 'reviews', 'reviewCount', 'url', 'desc', 'live', 'source', 'fetchedAt', 'marketplace', 'marketplaceProductId'];
function cleanItem(p) {
  if (!p || typeof p !== 'object') return null;
  if (typeof p.title !== 'string' || !p.title.trim()) return null;
  if (!Number.isFinite(+p.price) || +p.price <= 0) return null;
  const o = {};
  PICK.forEach((k) => { if (p[k] !== undefined) o[k] = p[k]; });
  o.id = String(o.id || '').slice(0, 40) || ('hf' + String(o.nmId || Date.now()));
  o.title = String(o.title).slice(0, 120);
  o.price = Math.round(+o.price);
  /* Дефолты обязательны: rankProducts/scoreProduct ждут полные поля,
     иначе один кривой товар роняет весь батч. */
  if (!Array.isArray(o.styles)) o.styles = [];
  if (!Array.isArray(o.colors)) o.colors = [];
  if (!Array.isArray(o.sizes) || !o.sizes.length) o.sizes = ['One'];
  if (typeof o.fit !== 'string' || !o.fit) o.fit = 'regular';
  if (!Number.isFinite(+o.rating)) o.rating = 0;
  if (!Number.isFinite(+o.reviews)) o.reviews = 0;
  if (typeof o.brand !== 'string') o.brand = '';
  o.live = true;
  o.source = 'homefeed';
  o.fetchedAt = Number(o.fetchedAt) || Date.now();
  return o;
}
function setItems(items) {
  const clean = (Array.isArray(items) ? items : []).map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);
  const seen = new Set(), out = [];
  clean.forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } });
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); } catch {}
  fs.writeFileSync(FILE, JSON.stringify({ ts: Date.now(), items: out }));
  return { accepted: out.length, ts: Date.now() };
}
module.exports = { enabled, getItems, setItems, stats, MAX_ITEMS };
