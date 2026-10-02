'use strict';
/* market.js — интеграция маркетплейсов.
   ЧЕСТНОСТЬ ПЕРВЕЕ ВСЕГО:
   - Wildberries: открытый поисковый API search.wb.ru (без ключа). Работает там,
     где сеть его не блокирует. CORS открыт (echo Origin) — возможен и прямой
     запрос из браузера пользователя (см. WBClient во frontend).
   - Ozon: открытого товарного API нет; витрина за антиботом (403). Провайдер
     пытается и честно отвечает NO_SOURCE. Для продакшена нужен официальный
     Seller/Partner API с credentials (см. README).
   Живые товары помечаются live:true/source:'wb' — UI показывает их отдельно
   от демо и не выдумывает им отзывы. */
const R = require('./recommend');

const WB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
/* vol -> номер basket-хоста. Таблица WB периодически дрейфует; при промахе
   фото отдаёт 404 — frontend подменяет заглушку (onerror fallback). */
const BASKET_RANGES = [[143, '01'], [287, '02'], [431, '03'], [575, '04'], [719, '05'], [863, '06'], [1007, '07'], [1151, '08'], [1295, '09'], [1439, '10'], [1583, '11'], [1727, '12'], [1871, '13'], [2015, '14'], [2159, '15'], [2303, '16'], [2447, '17'], [2591, '18'], [2735, '19'], [2879, '20'], [3023, '21'], [3167, '22'], [3311, '23'], [3455, '24'], [3599, '25'], [3743, '26'], [3887, '27'], [4031, '28'], [4175, '29'], [4319, '30'], [4463, '31'], [4607, '32'], [4751, '33']];
function basketHost(vol) {
  for (const [max, h] of BASKET_RANGES) if (vol <= max) return h;
  return '33';
}
function wbPhoto(id) {
  const vol = Math.floor(id / 100000), part = Math.floor(id / 1000);
  return `https://basket-${basketHost(vol)}.wb.ru/vol${vol}/part${part}/${id}/photos/big/1.webp`;
}
function wbUrl(id) { return `https://www.wildberries.ru/catalog/${id}/detail.aspx`; }
const WB_COLORS = [['черн', 'black'], ['бел', 'white'], ['сер', 'gray'], ['беж', 'beige'], ['олив', 'olive'], ['хаки', 'olive'], ['зелен', 'green'], ['зелён', 'green'], ['син', 'blue'], ['голуб', 'blue'], ['коричн', 'brown'], ['бордо', 'brown']];
const WB_CATS = [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['свитер', 'top'], ['джемпер', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['юбк', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['туфл', 'shoes'], ['рюкзак', 'acc'], ['сумк', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc'], ['ремень', 'acc'], ['ремен', 'acc'], ['шапк', 'acc']];
function wbColorKeys(names) {
  const out = [];
  (names || []).forEach((n) => {
    const s = String(n).toLowerCase();
    WB_COLORS.forEach(([k, v]) => { if (s.includes(k) && !out.includes(v)) out.push(v); });
  });
  return out.slice(0, 2);
}
function wbCat(name) {
  const s = String(name || '').toLowerCase();
  for (const [k, v] of WB_CATS) if (s.includes(k)) return v;
  return 'top';
}
/* Стили выводим из названия (честно: только явные маркеры). */
function wbStyles(name) {
  const s = String(name || '').toLowerCase();
  const out = [];
  if (/оверсайз|oversize/.test(s)) out.push('oversize', 'street');
  if (/спорт|бегов|фитнес/.test(s)) out.push('sport');
  if (/классич|classic/.test(s)) out.push('classic');
  if (/делов|офис|бизнес/.test(s)) out.push('business', 'smart');
  if (/минимал|базов/.test(s)) out.push('minimal', 'casual');
  if (/худи|толстовк|карго|стрит/.test(s)) out.push('street', 'casual');
  if (/кожан|вечерн|праздничн/.test(s)) out.push('party');
  return [...new Set(out)].slice(0, 3);
}
function normalizeWbItem(raw) {
  const id = raw.id || raw.nmId;
  if (!id) return null;
  const price = Math.round((raw.salePriceU != null ? raw.salePriceU : raw.salePrice) / 100) || 0;
  const old = Math.round((raw.priceU != null ? raw.priceU : raw.price) / 100) || price;
  if (!price) return null;
  const colorNames = (raw.colors || []).map((c) => (c && c.name) || c).filter(Boolean);
  const sizes = (raw.sizes || []).map((s) => String((s && (s.origName || s.name)) || s)).filter((x) => x && x.length <= 8).slice(0, 8);
  return {
    id: 'wb' + id, nmId: id,
    marketplace: 'wildberries', marketplaceProductId: String(id),
    title: String(raw.name || 'Товар Wildberries').slice(0, 120),
    price, oldPrice: old > price ? old : Math.round(price * 1.2), old: old > price ? old : Math.round(price * 1.2),
    currency: 'RUB',
    img: wbPhoto(id), imageUrl: wbPhoto(id), mp: 'WB', brand: String(raw.brand || '').slice(0, 40),
    cat: wbCat(raw.name), category: wbCat(raw.name), colors: wbColorKeys(colorNames), sizes: sizes.length ? sizes : ['One'],
    styles: wbStyles(raw.name), fit: 'regular',
    rating: Number(raw.reviewRating || raw.rating) || 0, reviews: Number(raw.feedbacks || 0), reviewCount: Number(raw.feedbacks || 0),
    availability: { inStock: null, sizes: sizes.length ? sizes : [] },
    live: true, source: 'wb', url: wbUrl(id), fetchedAt: Date.now(), desc: ''
  };
}
/* Публичные CORS-прокси как крайняя мера: запрос идёт с чужого IP.
   Только текст поискового запроса, без данных пользователя. */
const WB_PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u)
];
async function wbFetch(url) {
  const attempt = async (target, ms) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(target, { signal: ctrl.signal, headers: { 'User-Agent': WB_UA, Accept: 'application/json', 'Accept-Language': 'ru-RU,ru;q=0.9' } });
      if (r.status === 403 || r.status === 429) { const e = new Error('reject ' + r.status); e.code = 'REJECT'; throw e; }
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.code = 'HTTP'; throw e; }
      return await r.json();
    } finally { clearTimeout(t); }
  };
  try {
    return await attempt(url, 10000);
  } catch (e) { /* прямой путь закрыт — пробуем прокси */ }
  for (const px of WB_PROXIES) {
    try {
      return await attempt(px(url), 12000);
    } catch (e) { /* следующий */ }
  }
  const err = new Error('Wildberries недоступен ни напрямую, ни через прокси');
  err.code = 'WB_BLOCKED'; err.status = 502; throw err;
}
/* Живой поиск WB. Возвращает нормализованные товары. */
async function wbSearchServer(query, limit, page) {
  const q = encodeURIComponent(String(query || '').slice(0, 80));
  if (!q) return [];
  const spp = Math.min(100, Math.max(30, limit || 30));
  const url = `https://search.wb.ru/exactmatch/ru/common/v18/search?ab_testing=false&appType=1&curr=rub&dest=-1257786&page=${page || 1}&query=${q}&resultset=catalog&sort=popular&spp=${spp}&suppressSpellcheck=false`;
  const j = await wbFetch(url);
  const list = (j && j.data && j.data.products) || [];
  return list.map(normalizeWbItem).filter(Boolean).slice(0, limit || 30);
}
/* Веер запросов из структуры: категории по отдельности + цвет.
   Даёт широкое покрытие вместо одного узкого запроса. */
function structToQueries(st) {
  const s = st || {};
  const cmap = { black: 'черный', white: 'белый', olive: 'оливковый', beige: 'бежевый', gray: 'серый', green: 'зеленый', blue: 'синий', brown: 'коричневый' };
  const catWords = { top: ['футболка', 'худи', 'куртка'], bottom: ['брюки', 'джинсы'], shoes: ['кроссовки', 'кеды'], acc: ['аксессуар'] };
  const words = catWords[s.category] || ['одежда'];
  const color = cmap[s.color] ? ' ' + cmap[s.color] : '';
  const queries = words.slice(0, 3).map((w) => (w + color).trim());
  if (s.style === 'sport') queries.push('спортивная одежда' + color);
  if (s.style === 'business') queries.push('деловой костюм рубашка' + color);
  return [...new Set(queries)].slice(0, 3);
}
function dedupeLive(items) {
  const seen = new Set(), out = [];
  (items || []).forEach((p) => {
    const k = p.nmId || p.id;
    if (!k || seen.has(k)) return;
    seen.add(k); out.push(p);
  });
  return out;
}
/* Воронка: несколько запросов × страницы → merge → dedupe.
   Возвращает до ~200 кандидатов; дальше режут код и движок, не AI. */
async function funnelSearch(queries, perQuery, pages) {
  const jobs = [];
  (queries || []).slice(0, 3).forEach((q) => {
    for (let p = 1; p <= Math.min(3, pages || 2); p++) jobs.push(wbSearchServer(q, perQuery || 30, p));
  });
  const settled = await Promise.allSettled(jobs);
  let all = [];
  settled.forEach((r) => { if (r.status === 'fulfilled' && r.value) all = all.concat(r.value); });
  return dedupeLive(all);
}
/* Скоринг живых товаров тем же движком (профиль+фидбек+гардероб). */
function scoreLive(items, ctx) {
  return R.rankProducts(items.map((p) => Object.assign({ seasons: ['spring', 'summer', 'autumn', 'winter'] }, p)), ctx);
}
function structToQuery(st) {
  const parts = [];
  const cmap = { black: 'черный', white: 'белый', olive: 'оливковый', beige: 'бежевый', gray: 'серый', green: 'зеленый', blue: 'синий', brown: 'коричневый' };
  if (st.category === 'top') parts.push('футболка худи куртка');
  else if (st.category === 'bottom') parts.push('брюки джинсы');
  else if (st.category === 'shoes') parts.push('кроссовки');
  else if (st.category === 'acc') parts.push('аксессуар');
  if (st.color && cmap[st.color]) parts.push(cmap[st.color]);
  return parts.join(' ').trim() || 'одежда';
}
/* Ozon: честная заглушка. Витрина за антиботом; нужен официальный API. */
async function ozonSearchServer() {
  const e = new Error('Ozon блокирует серверные запросы (антибот). Подключи официальный Seller/Partner API — см. README.');
  e.code = 'NO_SOURCE'; e.status = 503; throw e;
}

/* =====================================================================
   PROVIDER LAYER (§1, §15, §18 ТЗ)
   sainvio → MarketplaceService → MarketplaceProvider → CatalogProvider
   AI работает только с нормализованной моделью Product и не знает
   внутренний формат WB/Ozon. Неофициальный доступ — только опциональный
   CatalogProvider, никогда обязательная основа.
   ===================================================================== */
function toModel(p) {
  if (!p || typeof p !== 'object') return null;
  const mp = p.live ? (p.mp === 'OZON' ? 'ozon' : 'wildberries') : 'demo';
  return Object.assign({}, p, {
    marketplace: p.marketplace || mp,
    marketplaceProductId: p.marketplaceProductId || String(p.nmId || p.id || ''),
    oldPrice: p.oldPrice != null ? p.oldPrice : p.old,
    currency: p.currency || 'RUB',
    imageUrl: p.imageUrl || p.img,
    reviewCount: p.reviewCount != null ? p.reviewCount : p.reviews,
    category: p.category || p.cat,
    availability: p.availability || (p.live ? { inStock: null, sizes: p.sizes || [] } : { inStock: true, sizes: p.sizes || [], demo: true })
  });
}
function normTitle(t) { return String(t || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim(); }

/* ---------- Партнёрские ссылки (монетизация + легитимная связь с WB) ----------
   Формат: AFFILIATE_WB_PREFIX=https://cpa-сеть/deeplink?ulp= (префикс + encodeURIComponent(url)).
   Без префиксов возвращаем чистый URL. Теги — только в env, не в коде. */
function affLink(mp, url) {
  try {
    const pre = mp === 'WB' ? (process.env.AFFILIATE_WB_PREFIX || '') : (process.env.AFFILIATE_OZON_PREFIX || '');
    if (!pre) return { url, affiliate: false };
    return { url: pre + encodeURIComponent(url), affiliate: true };
  } catch (e) { return { url, affiliate: false }; }
}

/* ---------- CatalogProvider: источник сырых данных ---------- */
class CatalogProvider {
  constructor(name) { this.catalogName = name; }
  async search(params) { throw new Error('not implemented'); }
  async getProduct(id) { return null; }
}
class DemoCatalogProvider extends CatalogProvider {
  constructor(products) { super('demo-catalog'); this.products = products || []; }
  async search(params) {
    const q = params || {};
    let list = this.products.slice();
    if (q.query) { const s = q.query.toLowerCase(); list = list.filter((p) => (p.title + ' ' + (p.brand || '')).toLowerCase().includes(s)); }
    if (q.category) list = list.filter((p) => p.cat === q.category);
    if (q.minPrice != null) list = list.filter((p) => p.price >= q.minPrice);
    if (q.maxPrice != null) list = list.filter((p) => p.price <= q.maxPrice);
    if (q.colors && q.colors.length) list = list.filter((p) => (p.colors || []).some((c) => q.colors.includes(c)));
    if (q.sizes && q.sizes.length) list = list.filter((p) => (p.sizes || []).some((s) => q.sizes.includes(String(s))));
    if (q.brands && q.brands.length) list = list.filter((p) => q.brands.includes(p.brand));
    const total = list.length;
    const off = Math.max(0, q.offset || 0);
    list = list.slice(off, off + (q.limit || 20));
    return { items: list.map(toModel), total, source: 'demo' };
  }
  async getProduct(id) {
    const p = this.products.find((x) => x.id === id);
    return p ? toModel(p) : null;
  }
}
class WbPublicCatalogProvider extends CatalogProvider {
  constructor() { super('wb-public-search'); }
  async search(params) {
    const q = params || {};
    const text = q.query || structToQuery({ category: q.category, color: (q.colors || [])[0] });
    let items = await wbSearchServer(text, Math.min(30, q.limit || 12));
    if (q.minPrice != null) items = items.filter((p) => p.price >= q.minPrice);
    if (q.maxPrice != null) items = items.filter((p) => p.price <= q.maxPrice);
    if (q.sizes && q.sizes.length) items = items.filter((p) => (p.sizes || []).some((s) => q.sizes.includes(String(s))) || (p.sizes || []).includes('One'));
    const off = Math.max(0, q.offset || 0);
    items = items.slice(off, off + (q.limit || 12));
    return { items: items.map(toModel), total: items.length, source: 'wb' };
  }
  async getProduct(nmId) {
    const id = String(nmId).replace(/^wb/, '');
    if (!/^\d+$/.test(id)) return null;
    try {
      const j = await wbFetch(`https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&dest=-1257786&nm=${id}`);
      const raw = j && j.data && j.data.products && j.data.products[0];
      return raw ? toModel(normalizeWbItem(raw)) : null;
    } catch (e) { return null; }
  }
}
class OzonCatalogProvider extends CatalogProvider {
  constructor() { super('ozon-official-todo'); }
  async search() { await ozonSearchServer(); }
  async getProduct() { await ozonSearchServer(); return null; }
}
/* Открытые датасеты (open data): локальные CSV-снимки каталога.
   Источник честно виден в item.source + datasetDate. */
class DatasetCatalogProvider extends CatalogProvider {
  constructor() { super('open-datasets'); }
  async search(params) {
    const D = require('./datasets');
    const rows = await D.ensureLoaded();
    const r = D.searchRows(rows, params || {});
    return { items: r.items, total: r.total, source: 'dataset' };
  }
  async getProduct(id) {
    const D = require('./datasets');
    const rows = await D.ensureLoaded();
    return rows.find((p) => p.id === id) || null;
  }
}

/* ---------- MarketplaceProvider: search/get/reviews/availability ---------- */
class MarketplaceProvider {
  constructor(marketplace, catalog) { this.marketplace = marketplace; this.catalog = catalog; }
  async searchProducts(params) { return this.catalog.search(params || {}); }
  async getProduct(id) { return this.catalog.getProduct(id); }
  async getReviews(id) { return []; }
  async getAvailability(id) {
    const p = await this.getProduct(id);
    return p ? (p.availability || { inStock: null }) : null;
  }
}
class WildberriesProvider extends MarketplaceProvider {
  constructor() { super('wildberries', new WbPublicCatalogProvider()); }
  async getReviews() { return []; } // отзывов не выдумываем; тексты — только на странице WB
}
class OzonProvider extends MarketplaceProvider {
  constructor() { super('ozon', new OzonCatalogProvider()); }
}
class DemoMarketplaceProvider extends MarketplaceProvider {
  constructor(products) {
    const C = require('./catalog');
    super('demo', new DemoCatalogProvider(products || C.PRODUCTS));
  }
  async getReviews(id) {
    const C = require('./catalog');
    const r = C.getReviews(id);
    if (!r) return [];
    return (r.reviews || []).map((x) => ({ author: x.author, rating: x.rating, text: x.text, source: 'demo' }));
  }
}

/* ---------- Takprodam Publisher API: легальный каталог + партнёрки ----------
   Регистрация паблишера (сайт/агрегатор) → токен из профиля → env.
   Методы: product/ (товары с tracking_link, фильтры marketplace/category/
   payment, limit до 1000), product-category/, promotion/, source/.
   Цены/комиссии обновляются раз в сутки. legal_text показываем в UI. */
const TAKPRODAM_BASE = 'https://api.takprodam.ru/v2/publisher';
function takprodamCfg() {
  return { key: process.env.TAKPRODAM_API_KEY || '' };
}
async function takprodamGet(path, params) {
  const { key } = takprodamCfg();
  if (!key) { const e = new Error('Нужен TAKPRODAM_API_KEY: регистрация паблишера на takprodam.ru → токен из профиля.'); e.code = 'NO_SOURCE'; e.status = 503; throw e; }
  const qs = new URLSearchParams(params || {}).toString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(TAKPRODAM_BASE + path + (qs ? '?' + qs : ''), { signal: ctrl.signal, headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) { const e = new Error('Недействительный TAKPRODAM_API_KEY'); e.code = 'AUTH'; e.status = 502; throw e; }
    if (!r.ok) { const e = new Error('Takprodam: HTTP ' + r.status); e.code = 'TP_ERROR'; e.status = 502; throw e; }
    return r.json();
  } catch (e) {
    if (e.code) throw e;
    const x = new Error('Takprodam недоступен: ' + e.message); x.code = 'TP_DOWN'; x.status = 502; throw x;
  } finally { clearTimeout(t); }
}
function takprodamCatToOurs(tpCategory) {
  const s = String(tpCategory || '').toLowerCase();
  for (const [k, v] of WB_CATS) if (s.includes(k)) return v;
  return '';
}
function normalizeTakprodam(raw) {
  if (!raw || !raw.id) return null;
  const mpName = String(raw.marketplace_title || '').toLowerCase();
  const mp = mpName.includes('ozon') ? 'OZON' : 'WB';
  const price = Math.round(Number(raw.price)) || 0;
  if (!price) return null;
  const title = String(raw.title || '').slice(0, 120);
  return {
    id: 'tp' + raw.id, marketplace: mp === 'OZON' ? 'ozon' : 'wildberries',
    marketplaceProductId: String(raw.product_id || raw.product_sku || raw.id),
    title, brand: String(raw.store_title || '').slice(0, 40),
    cat: takprodamCatToOurs(raw.product_category + ' ' + title),
    category: takprodamCatToOurs(raw.product_category + ' ' + title),
    price, oldPrice: price, old: price, currency: 'RUB',
    img: String(raw.image_url || ''), imageUrl: String(raw.image_url || ''), mp,
    url: String(raw.external_link || ''), trackingUrl: String(raw.tracking_link || ''),
    rating: 0, reviews: 0, reviewCount: 0,
    colors: wbColorKeys([title]), sizes: ['One'],
    styles: wbStyles(title), fit: 'regular',
    availability: { inStock: null, sizes: [] },
    commission: raw.commission != null ? Number(raw.commission) : null,
    legalText: String(raw.legal_text || ''),
    live: true, source: 'takprodam', fetchedAt: Date.now(), desc: ''
  };
}
class TakprodamCatalogProvider extends CatalogProvider {
  constructor() { super('takprodam-publisher'); }
  async search(params) {
    const q = params || {};
    // API без текстового поиска: тянем страницы категории и фильтруем локально.
    const pages = Math.min(3, Math.max(1, q.pages || 2));
    const perPage = Math.min(200, Math.max(20, q.perPage || 100));
    let all = [];
    for (let page = 1; page <= pages; page++) {
      const j = await takprodamGet('/product/', {
        marketplace: q.marketplace === 'ozon' ? 'Ozon' : q.marketplace === 'wildberries' ? 'Wildberries' : undefined,
        category_id: q.tp_category_id || undefined,
        payment_type: q.payment_type || undefined,
        page, limit: perPage
      });
      const arr = j.products || j.items || j.data || j.results || [];
      if (!arr.length) break;
      all = all.concat(arr);
      if (arr.length < perPage) break;
    }
    let items = all.map(normalizeTakprodam).filter(Boolean);
    if (q.query) {
      const toks = String(q.query).toLowerCase().replace(/[^a-zа-я0-9ё\s]+/gi, ' ').split(/\s+/).filter((w) => w.length >= 4);
      if (toks.length) items = items.filter((p) => toks.every((t) => (p.title + ' ' + p.brand).toLowerCase().includes(t)));
    }
    if (q.category) items = items.filter((p) => p.cat === q.category);
    if (q.minPrice != null) items = items.filter((p) => p.price >= q.minPrice);
    if (q.maxPrice != null) items = items.filter((p) => p.price <= q.maxPrice);
    const total = items.length;
    const off = Math.max(0, q.offset || 0);
    return { items: items.slice(off, off + (q.limit || 24)), total, source: 'takprodam' };
  }
  async getProduct() { return null; } // поштучного endpoint нет — только списки
}
class TakprodamProvider extends MarketplaceProvider {
  constructor() { super('takprodam', new TakprodamCatalogProvider()); }
  async getReviews() { return []; }
  async getAvailability(id) {
    const p = await this.getProduct(id);
    return p ? { inStock: null, sizes: [] } : null;
  }
}
/* ---------- MarketplaceService: единая точка входа ---------- */
class MarketplaceService {
  constructor(providers) {
    const D = require('./datasets');
    this.providers = providers || {
      wildberries: new WildberriesProvider(),
      ozon: new OzonProvider(),
      demo: new DemoMarketplaceProvider(),
      takprodam: new TakprodamProvider(),
      dataset: new (class extends MarketplaceProvider {
        constructor() { super('dataset', new DatasetCatalogProvider()); }
        async getReviews() { return []; }
        async getAvailability(id) {
          const p = await this.getProduct(id);
          return p ? { inStock: null, sizes: p.sizes || [] } : null;
        }
      })()
    };
    this._datasets = D;
  }
  pick(mp) {
    if (!mp || mp === 'all') return Object.values(this.providers);
    if (mp === 'wb' || mp === 'wildberries') return [this.providers.wildberries];
    if (mp === 'ozon') return [this.providers.ozon];
    if (mp === 'demo') return [this.providers.demo];
    if (mp === 'takprodam' || mp === 'tp') return [this.providers.takprodam];
    if (mp === 'dataset') return [this.providers.dataset];
    return Object.values(this.providers);
  }
  /* Параллельный поиск + merge + dedupe. Падение одного провайдера
     не роняет остальные (требование §19.5/6). */
  async search(params) {
    const q = params || {};
    const settled = await Promise.allSettled(this.pick(q.marketplace).map((pv) => pv.searchProducts(q)));
    const items = [], errors = {};
    settled.forEach((r, i) => {
      const name = this.pick(q.marketplace)[i].marketplace;
      if (r.status === 'fulfilled' && r.value && r.value.items) items.push(...r.value.items);
      else errors[name] = (r.reason && r.reason.message) || 'unavailable';
    });
    const seen = new Set(), out = [];
    items.forEach((p) => {
      const k = p.marketplace + '|' + normTitle(p.title);
      if (seen.has(k)) return;
      seen.add(k); out.push(p);
    });
    return { items: out.slice(0, q.limit || 24), total: out.length, errors };
  }
  async getProduct(id) {
    if (String(id).startsWith('wb')) return this.providers.wildberries.getProduct(id);
    if (String(id).startsWith('oz')) return this.providers.ozon.getProduct(id);
    if (String(id).startsWith('ds')) return this.providers.dataset.getProduct(id);
    return this.providers.demo.getProduct(id);
  }
  async getReviews(id) {
    if (String(id).startsWith('wb')) return this.providers.wildberries.getReviews(id);
    if (String(id).startsWith('ds')) return this.providers.dataset.getReviews(id);
    return this.providers.demo.getReviews(id);
  }
  async getAvailability(id) {
    if (String(id).startsWith('wb')) return this.providers.wildberries.getAvailability(id);
    if (String(id).startsWith('ds')) return this.providers.dataset.getAvailability(id);
    return this.providers.demo.getAvailability(id);
  }
}

module.exports = { wbSearchServer, funnelSearch, dedupeLive, ozonSearchServer, normalizeWbItem, scoreLive, structToQuery, structToQueries, wbPhoto, wbUrl, affLink, toModel, takprodamGet, normalizeTakprodam, CatalogProvider, DemoCatalogProvider, WbPublicCatalogProvider, OzonCatalogProvider, TakprodamCatalogProvider, MarketplaceProvider, WildberriesProvider, OzonProvider, DemoMarketplaceProvider, TakprodamProvider, MarketplaceService };
