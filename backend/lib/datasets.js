'use strict';
/* datasets.js — открытые датасеты товаров (open data).
   Формат: SOURCES = [{name, url, file, date, note}]. CSV скачивается один раз
   в backend/data/datasets/, парсится без зависимостей, ищется в памяти
   (тысячи строк — мгновенно; под миллионы понадобится SQLite/FTS).
   Честность: source:'dataset', дата снимка видна в UI — цены могли устареть.
   Чтобы добавить базу: допиши SOURCES + при необходимости columns() под её
   колонки. Ozon в открытом виде не найден (проверено: HF, Kaggle, GitHub). */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'data', 'datasets');
const SOURCES = [
  {
    name: 'wb-sample-1k',
    url: 'https://raw.githubusercontent.com/luminati-io/Wildberries-dataset-sample/main/Wildberries-dataset-sample.csv',
    file: 'wb-sample-1k.csv',
    date: '2024-12',
    origin: 'Bright Data, sample 1001 шт',
    columns: (h) => ({
      url: h.url, sku: h.sku, breadcrumbs: h.breadcrumbs, name: h.name,
      rating: h.rating, review_count: h.review_count, image: h.image, brand: h.brand,
      initial_price: h.initial_price, final_price: h.final_price, currency: h.currency,
      variations: h.product_variation, details: h.product_details
    })
  }
];
let ROWS = null; // [{...product, _src}]
let loading = null;
function dir() { try { fs.mkdirSync(DIR, { recursive: true }); } catch {} }
function parseCSV(text) {
  const rows = [];
  let cur = [''], q = false;
  const clean = (s) => s.replace(/^\uFEFF/, '');
  text = clean(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; }
        else q = false;
      } else cur[cur.length - 1] += c;
    } else if (c === '"') q = true;
    else if (c === ',') cur.push('');
    else if (c === '\n') { rows.push(cur); cur = ['']; }
    else if (c === '\r') { /* skip */ }
    else cur[cur.length - 1] += c;
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows;
}
function safeJSON(s, fb) { try { const v = JSON.parse(s); return v == null ? fb : v; } catch { return fb; } }
const RU_COLORS = [['черн', 'black'], ['бел', 'white'], ['сер', 'gray'], ['беж', 'beige'], ['олив', 'olive'], ['хаки', 'olive'], ['зелен', 'green'], ['зелён', 'green'], ['син', 'blue'], ['голуб', 'blue'], ['коричн', 'brown'], ['бордо', 'brown'], ['красн', 'brown'], ['розов', 'beige'], ['фиолет', 'blue'], ['желт', 'beige'], ['оранж', 'brown']];
function ruColors(strs) {
  const out = [];
  (strs || []).forEach((n) => {
    const s = String(n).toLowerCase().replace(/ё/g, 'е');
    RU_COLORS.forEach(([k, v]) => { if (s.includes(k) && !out.includes(v)) out.push(v); });
  });
  return out.slice(0, 2);
}
const CAT_KEYS = [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['свитер', 'top'], ['джемпер', 'top'], ['блуз', 'top'], ['майк', 'top'], ['топ', 'top'], ['плать', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['юбк', 'bottom'], ['шорт', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['туфл', 'shoes'], ['сапог', 'shoes'], ['тапоч', 'shoes'], ['рюкзак', 'acc'], ['сумк', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc'], ['ремен', 'acc'], ['шапк', 'acc'], ['шарф', 'acc'], ['перчат', 'acc'], ['кошел', 'acc'], ['костюм', 'top'], ['купальник', 'top'], ['пижам', 'top'], ['халат', 'top'], ['ветровк', 'top'], ['пуховик', 'top'], ['жилет', 'top'], ['кардиган', 'top'], ['водолазк', 'top'], ['поло', 'top'], ['сарафан', 'top'], ['туник', 'top'], ['леггинс', 'bottom'], ['бридж', 'bottom'], ['комбинезон', 'bottom'], ['трусы', 'bottom'], ['сникерс', 'shoes'], ['слипон', 'shoes'], ['сандали', 'shoes'], ['балетк', 'shoes'], ['лофер', 'shoes'], ['угг', 'shoes'], ['босоножк', 'shoes'], ['шлепанц', 'shoes'], ['мокасин', 'shoes'], ['панам', 'acc'], ['бейсболк', 'acc'], ['варежк', 'acc'], ['платок', 'acc'], ['галстук', 'acc'], ['носк', 'acc'], ['колгот', 'acc'], ['браслет', 'acc'], ['серьг', 'acc']];
/* Точные подкатегории из названия: иначе «верх» = всё от футболки до халата. */
const SUB_KEYS = [
  ['tshirt', ['футболк']], ['shirt', ['рубаш', 'блуз']], ['hoodie', ['худи', 'толстов', 'свитшот']],
  ['jacket', ['куртк', 'ветровк', 'пуховик', 'бомбер', 'жилет', 'пальто', 'плащ', 'парк', 'дубленк']],
  ['dress', ['плать', 'сарафан']], ['sweater', ['свитер', 'джемпер', 'кардиган', 'водолазк', 'пуловер']],
  ['polo', ['поло']], ['tank', ['майк', 'топик']], ['suit', ['костюм']], ['pajama', ['пижам']],
  ['robe', ['халат']], ['swim', ['купальник']],
  ['pants', ['брюк', 'чинос', 'карго', 'слакс']], ['jeans', ['джинс']], ['shorts', ['шорт', 'бридж']],
  ['skirt', ['юбк']], ['leggings', ['леггинс']], ['overalls', ['комбинезон']],
  ['sneakers', ['кроссов', 'кед', 'сникерс', 'слипон']], ['boots', ['ботин', 'челси', 'угг', 'сапог']],
  ['dress_shoes', ['туфл', 'лофер', 'мокасин', 'балетк']], ['sandals', ['сандал', 'босоножк', 'шлепанц', 'сланц']],
  ['bag', ['сумк', 'рюкзак', 'клатч', 'шоппер']], ['watch', ['часы']], ['cap', ['кепк', 'бейсболк', 'панам']],
  ['glasses', ['очк', 'очки']], ['hat', ['шапк', 'бини']], ['scarf', ['шарф', 'платок', 'снуд']],
  ['gloves', ['перчат', 'варежк']], ['belt', ['ремен', 'ремень']], ['wallet', ['кошел']],
  ['socks', ['носк', 'носки', 'гольф', 'колгот']], ['jewelry', ['браслет', 'серьг', 'кольц', 'цепочк', 'кулон', 'брошь']]
];
function guessSub(name) {
  const s = String(name || '').toLowerCase();
  for (const [sub, keys] of SUB_KEYS) { for (const k of keys) if (s.includes(k)) return sub; }
  return '';
}
/* Русский стемминг-лайт: «футболка» и «футболки» → одна основа. */
function stemRU(w) {
  w = String(w || '').toLowerCase().replace(/ё/g, 'е');
  if (w.length <= 4) return w;
  return w.replace(/(иями|ями|ами|ией|ей|ой|ий|ый|ую|юю|ая|яя|ое|ее|ые|ие|а|я|ы|и|у|ю|е|о|ь)$/, '');
}
function guessCat(hay) {
  const s = String(hay || '').toLowerCase();
  for (const [k, v] of CAT_KEYS) if (s.includes(k)) return v;
  return '';
}
/* Стили — только явные маркеры в названии, без выдумок. */
function guessStyles(name) {
  const s = String(name || '').toLowerCase();
  const out = [];
  if (/оверсайз|oversize/.test(s)) out.push('oversize', 'street');
  if (/спорт|бегов/.test(s)) out.push('sport');
  if (/классич/.test(s)) out.push('classic');
  if (/делов|офис|бизнес/.test(s)) out.push('business', 'smart');
  if (/минимал|базов/.test(s)) out.push('minimal', 'casual');
  if (/худи|карго|стрит/.test(s)) out.push('street', 'casual');
  if (/кожан|вечерн|нарядн/.test(s)) out.push('party');
  if (/повседневн/.test(s)) out.push('casual');
  return [...new Set(out)].slice(0, 3);
}
function mapRow(r, meta) {
  const sku = String(r.sku || '').trim();
  if (!sku || !r.name) return null;
  const price = parseInt(r.final_price) || 0;
  if (!price) return null;
  const old = parseInt(r.initial_price) || price;
  const crumb = safeJSON(r.breadcrumbs, []);
  const crumbStr = Array.isArray(crumb) ? crumb.join(' ') : String(crumb || '');
  const vars = safeJSON(r.variations, []);
  const colorVals = [], sizeVals = [];
  (Array.isArray(vars) ? vars : []).forEach((v) => {
    if (!v || !v.type) return;
    const t = String(v.type).toLowerCase();
    const vals = Array.isArray(v.values) ? v.values : [v.values];
    if (t.includes('color') || t.includes('цвет')) vals.forEach((x) => colorVals.push(String(x)));
    if (t.includes('size') || t.includes('размер')) vals.forEach((x) => String(x).split(/[,;]/).forEach((s) => { const z = s.trim().slice(0, 8); if (z) sizeVals.push(z); }));
  });
  const details = safeJSON(r.details, []);
  let material = '';
  (Array.isArray(details) ? details : []).forEach((d) => {
    if (d && /состав/i.test(String(d.type || ''))) material = String(d.value || '').slice(0, 120);
  });
  const colors = ruColors(colorVals.concat([r.name]));
  return {
    id: 'ds' + sku, nmId: sku,
    marketplace: 'wildberries', marketplaceProductId: sku,
    title: String(r.name).slice(0, 120), brand: String(r.brand || '').slice(0, 40),
    cat: guessCat(crumbStr + ' ' + r.name), category: guessCat(crumbStr + ' ' + r.name),
    price, oldPrice: old > price ? old : price, old: old > price ? old : price, currency: 'RUB',
    img: String(r.image || ''), imageUrl: String(r.image || ''), mp: 'WB',
    url: String(r.url || '').split('?')[0],
    rating: parseFloat(r.rating) || 0, reviews: parseInt(r.review_count) || 0, reviewCount: parseInt(r.review_count) || 0,
    colors, sizes: sizeVals.slice(0, 8).length ? sizeVals.slice(0, 8) : ['One'],
    styles: guessStyles(r.name), sub: guessSub(r.name + ' ' + crumbStr), fit: 'regular', material, desc: '',
    availability: { inStock: null, sizes: sizeVals.slice(0, 8) },
    live: false, dataset: true, source: 'dataset:' + meta.name, datasetDate: meta.date,
    fetchedAt: Date.now()
  };
}
async function loadSource(meta) {
  dir();
  const fp = path.join(DIR, meta.file);
  let text = null;
  try { text = fs.readFileSync(fp, 'utf8'); } catch {}
  if (!text) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(meta.url, { signal: ctrl.signal, headers: { 'User-Agent': 'sainvio/1.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      text = await r.text();
      fs.writeFileSync(fp, text);
    } finally { clearTimeout(t); }
  }
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => String(h).trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const o = {};
    head.forEach((h, j) => { o[h] = rows[i][j] != null ? rows[i][j] : ''; });
    const p = mapRow(meta.columns(o), meta);
    if (p && p.cat) out.push(Object.assign(p, { _src: meta.name }));
  }
  return out;
}
async function ensureLoaded() {
  if (ROWS) return ROWS;
  if (!loading) {
    loading = (async () => {
      let all = [];
      for (const meta of SOURCES) {
        try { all = all.concat(await loadSource(meta)); }
        catch (e) { console.error('dataset', meta.name, e.message); }
      }
      ROWS = all;
      console.log(`datasets: loaded ${all.length} rows from ${SOURCES.length} source(s)`);
      return ROWS;
    })();
  }
  return loading;
}
const STOP_RU = new Set(['найди', 'мне', 'что', 'это', 'как', 'для', 'меня', 'есть', 'хочу', 'подбери', 'покажи', 'нужен', 'нужна', 'нужно', 'образ', 'что-нибудь', 'чтонибудь', 'что-то']);
function searchRows(rows, q) {
  let list = rows.slice();
  if (q.subcategory) list = list.filter((p) => p.sub === q.subcategory);
  if (q.query) {
    const toks = String(q.query).toLowerCase().replace(/[^a-zа-я0-9ё\s]+/gi, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP_RU.has(w)).map(stemRU);
    if (toks.length) {
      const hay = (p) => (p.title + ' ' + (p.brand || '')).toLowerCase().split(/[^a-zа-я0-9ё]+/i).map(stemRU).join(' ');
      let hit = list.filter((p) => { const h = hay(p); return toks.every((t) => h.includes(t)); });
      if (!hit.length) hit = list.filter((p) => { const h = hay(p); return toks.some((t) => h.includes(t)); });
      list = hit;
    }
  }
  if (q.category) list = list.filter((p) => p.cat === q.category);
  if (q.minPrice != null) list = list.filter((p) => p.price >= q.minPrice);
  if (q.maxPrice != null) list = list.filter((p) => p.price <= q.maxPrice);
  if (q.colors && q.colors.length) list = list.filter((p) => (p.colors || []).some((c) => q.colors.includes(c)));
  if (q.sizes && q.sizes.length) list = list.filter((p) => (p.sizes || []).some((s) => q.sizes.includes(String(s))) || (p.sizes || []).includes('One'));
  if (q.brands && q.brands.length) list = list.filter((p) => q.brands.includes(p.brand));
  const total = list.length;
  const off = Math.max(0, q.offset || 0);
  return { items: list.slice(off, off + (q.limit || 24)), total };
}
module.exports = { SOURCES, ensureLoaded, searchRows, parseCSV, mapRow, guessSub, get count() { return ROWS ? ROWS.length : 0; } };
