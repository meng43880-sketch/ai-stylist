'use strict';
/* homefeed.js — «домашний мост»: каталог, собранный скриптом collector/ или
   расширением ext/ и запушенный на сервер через POST /api/collector/push.
   Накопительная газета: прогоны ДОБАВЛЯЮТ/освежают карточки (не заменяют),
   живут неделю, потолок 5000. Хранение: backend/data/homefeed.json
   (gitignore, на Render эфемерно — мост перепушивает сам).
   Рубильник: COLLECTOR_ENABLED=true, иначе мост полностью выключен (откат
   без нового деплоя кода — достаточно сменить env на Render). */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'homefeed.json');
const ITEM_TTL_MS = 7 * 24 * 3600 * 1000; // карточка живёт неделю, потом чистка
const MAX_ITEMS = 5000; // накопительный потолок (~5-10 МБ JSON — норм)
const FRESH_PUSH_MS = 24 * 3600 * 1000; // свежий прогон был в последние сутки
function enabled() { return (process.env.COLLECTOR_ENABLED || '').toLowerCase() === 'true'; }
/* Ленивый доступ к store: файл — быстрый путь, PG-кеш — неубиваемый
   (переживает редеплои; без DATABASE_URL store работает в JSON-режиме). */
function db() { try { return require('./store'); } catch { return null; } }
function read() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (j && Array.isArray(j.items) && j.items.length) return j;
  } catch {}
  try {
    const S = db();
    if (S) {
      const hit = S.getCache('homefeed', 'items', 30 * 24 * 3600 * 1000);
      if (hit && Array.isArray(hit.items) && hit.items.length) return { items: hit.items, ts: hit.ts || 0 };
    }
  } catch {}
  return { items: [], ts: 0 };
}
function persist(items, ts) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); } catch {}
  try { fs.writeFileSync(FILE, JSON.stringify({ ts, items })); } catch {}
  try {
    const S = db();
    if (S) S.setCache('homefeed', 'items', { items, ts });
  } catch {}
}
function getItems() {
  if (!enabled()) return [];
  const j = read();
  if (!j.items.length) return [];
  // Накопительная газета: живы карточки моложе недели, цел ли последний прогон — неважно
  const now = Date.now();
  return j.items.filter((p) => p && (now - (p.fetchedAt || 0)) <= ITEM_TTL_MS);
}
function stats() {
  const j = read();
  const now = Date.now();
  const alive = j.items.filter((p) => p && (now - (p.fetchedAt || 0)) <= ITEM_TTL_MS).length;
  return {
    enabled: enabled(), count: j.items.length, alive, ts: j.ts || 0,
    ageMin: j.ts ? Math.round((now - j.ts) / 60000) : -1,
    fresh: enabled() && alive > 0 && (now - (j.ts || 0) <= FRESH_PUSH_MS)
  };
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
/* Накопление, а не замена: новые освежают старые (цена/наличие),
   протухшие (старше недели) и лишние сверх потолка вычищаются. */
function setItems(items) {
  const now = Date.now();
  const prev = read();
  const byId = new Map();
  prev.items.forEach((p) => { if (p && p.id) byId.set(p.id, p); });
  let fresh = 0;
  (Array.isArray(items) ? items : []).map(cleanItem).filter(Boolean).forEach((p) => {
    if (!byId.has(p.id)) fresh++;
    byId.set(p.id, Object.assign({}, byId.get(p.id), p, { fetchedAt: now }));
  });
  let out = [...byId.values()].filter((p) => (now - (p.fetchedAt || 0)) <= ITEM_TTL_MS);
  out.sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0));
  out = out.slice(0, MAX_ITEMS);
  persist(out, now);
  return { accepted: fresh, total: out.length, ts: now };
}
module.exports = { enabled, getItems, setItems, stats, MAX_ITEMS };
