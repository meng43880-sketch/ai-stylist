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
async function wbFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': WB_UA, Accept: 'application/json', 'Accept-Language': 'ru-RU,ru;q=0.9' } });
    if (r.status === 403 || r.status === 429) { const e = new Error('Wildberries отклонил запрос с этой сети (HTTP ' + r.status + ')'); e.code = 'WB_BLOCKED'; e.status = 502; throw e; }
    if (!r.ok) { const e = new Error('Wildberries: HTTP ' + r.status); e.code = 'WB_ERROR'; e.status = 502; throw e; }
    return r.json();
  } catch (e) {
    if (e.code) throw e;
    const x = new Error('Wildberries недоступен: ' + e.message); x.code = 'WB_DOWN'; x.status = 502; throw x;
  } finally { clearTimeout(t); }
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
   AI Stylist → MarketplaceService → MarketplaceProvider → CatalogProvider
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

/* ---------- MarketplaceService: единая точка входа ---------- */
class MarketplaceService {
  constructor(providers) {
    this.providers = providers || {
      wildberries: new WildberriesProvider(),
      ozon: new OzonProvider(),
      demo: new DemoMarketplaceProvider()
    };
  }
  pick(mp) {
    if (!mp || mp === 'all') return Object.values(this.providers);
    if (mp === 'wb' || mp === 'wildberries') return [this.providers.wildberries];
    if (mp === 'ozon') return [this.providers.ozon];
    if (mp === 'demo') return [this.providers.demo];
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
    return this.providers.demo.getProduct(id);
  }
  async getReviews(id) {
    if (String(id).startsWith('wb')) return this.providers.wildberries.getReviews(id);
    return this.providers.demo.getReviews(id);
  }
  async getAvailability(id) {
    if (String(id).startsWith('wb')) return this.providers.wildberries.getAvailability(id);
    return this.providers.demo.getAvailability(id);
  }
}

module.exports = { wbSearchServer, funnelSearch, dedupeLive, ozonSearchServer, normalizeWbItem, scoreLive, structToQuery, structToQueries, wbPhoto, wbUrl, toModel, CatalogProvider, DemoCatalogProvider, WbPublicCatalogProvider, OzonCatalogProvider, MarketplaceProvider, WildberriesProvider, OzonProvider, DemoMarketplaceProvider, MarketplaceService };
