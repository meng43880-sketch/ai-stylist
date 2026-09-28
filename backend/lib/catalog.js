'use strict';
/* catalog.js — источник демо-данных (DATA_SOURCE=demo).
   Production-интеграции WB/Ozon реализуют тот же интерфейс ProductProvider,
   но ходят в backend-proxy, а не возвращают выдуманные данные. */
const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;
/* seasons: в каких сезонах вещь уместна. */
const PRODUCTS = [
  { id: 'p01', title: 'Худи оверсайз с начёсом', price: 2890, old: 4900, img: U('1556821840-3a63f95609a7'), mp: 'WB', brand: 'Base', cat: 'top', colors: ['black'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], styles: ['casual', 'street', 'oversize', 'minimal'], fit: 'relaxed', rating: 4.8, reviews: 2314, material: 'хлопок 80%, полиэстер 20%, начёс', seasons: ['autumn', 'winter', 'spring'], desc: 'Плотный хлопок 320 г/м², начёс, свободный крой.' },
  { id: 'p02', title: 'Футболка базовая белая', price: 1290, old: 1990, img: U('1521572163474-6864f9cf17ab'), mp: 'WB', brand: 'Uniqlo', cat: 'top', colors: ['white'], sizes: ['S', 'M', 'L', 'XL'], styles: ['casual', 'minimal', 'smart', 'classic'], fit: 'regular', rating: 4.9, reviews: 5120, material: 'хлопок 100%', seasons: ['spring', 'summer', 'autumn'], desc: 'Хлопок, прямой крой, не просвечивает.' },
  { id: 'p03', title: 'Рубашка-overshirt бежевая', price: 4790, old: 6900, img: U('1596755094514-f87e34085b2c'), mp: 'OZON', brand: 'Mango', cat: 'top', colors: ['beige'], sizes: ['M', 'L', 'XL'], styles: ['smart', 'minimal', 'casual', 'oldmoney'], fit: 'regular', rating: 4.7, reviews: 864, material: 'хлопок 70%, лён 30%', seasons: ['spring', 'autumn'], desc: 'Носи как рубашку или лёгкую куртку.' },
  { id: 'p04', title: 'Куртка кожаная чёрная', price: 8990, old: 12900, img: U('1551028719-00167b16eac5'), mp: 'OZON', brand: 'Zara', cat: 'top', colors: ['black'], sizes: ['M', 'L', 'XL'], styles: ['street', 'party', 'classic'], fit: 'regular', rating: 4.6, reviews: 432, material: 'экокожа, подклад полиэстер', seasons: ['autumn', 'spring'], desc: 'Акцентный верх для вечера.' },
  { id: 'p05', title: 'Куртка field olive', price: 7490, old: 9900, img: U('1591047139829-d91aecb6caea'), mp: 'WB', brand: 'H&M', cat: 'top', colors: ['olive', 'green'], sizes: ['S', 'M', 'L', 'XL'], styles: ['casual', 'minimal', 'street', 'classic'], fit: 'regular', rating: 4.7, reviews: 1105, material: 'хлопок 65%, полиэстер 35%', seasons: ['autumn', 'spring'], desc: 'Оливковая куртка — ключевой цвет профиля.' },
  { id: 'p06', title: 'Лонгслив серый regular', price: 1590, old: 2400, img: U('1618354691373-d851c5c3a990'), mp: 'WB', brand: 'Base', cat: 'top', colors: ['gray'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], styles: ['casual', 'minimal', 'sport'], fit: 'regular', rating: 4.5, reviews: 1930, material: 'хлопок 100%', seasons: ['autumn', 'winter', 'spring'], desc: 'Спокойный базовый слой.' },
  { id: 'p07', title: 'Брюки прямые чёрные', price: 2990, old: 4500, img: U('1594938298603-c8148c4dae35'), mp: 'WB', brand: 'Mango', cat: 'bottom', colors: ['black'], sizes: ['30', '31', '32', '33', '34'], styles: ['smart', 'minimal', 'business', 'classic'], fit: 'straight', rating: 4.8, reviews: 2760, material: 'вискоза 70%, полиэстер 30%', seasons: ['autumn', 'winter', 'spring', 'summer'], desc: 'Прямой крой, средняя посадка.' },
  { id: 'p08', title: 'Джинсы прямые синие', price: 3490, old: 5200, img: U('1542272604-787c3835535d'), mp: 'OZON', brand: "Levi's", cat: 'bottom', colors: ['blue'], sizes: ['30', '31', '32', '33'], styles: ['casual', 'classic', 'street'], fit: 'straight', rating: 4.8, reviews: 3410, material: 'деним, хлопок 98%, эластан 2%', seasons: ['autumn', 'winter', 'spring', 'summer'], desc: 'Классика без потёртостей.' },
  { id: 'p09', title: 'Чиносы бежевые', price: 2790, old: 3900, img: U('1473966968600-fa801b869a1a'), mp: 'WB', brand: 'Uniqlo', cat: 'bottom', colors: ['beige'], sizes: ['30', '31', '32', '33', '34'], styles: ['smart', 'minimal', 'oldmoney', 'business'], fit: 'straight', rating: 4.6, reviews: 1240, material: 'хлопок 97%, эластан 3%', seasons: ['spring', 'summer', 'autumn'], desc: 'Светлый низ для контраста.' },
  { id: 'p10', title: 'Джинсы чёрные slim-straight', price: 3290, old: 4800, img: U('1541099649105-f69ad21f3246'), mp: 'WB', brand: 'Zara', cat: 'bottom', colors: ['black'], sizes: ['31', '32', '33'], styles: ['casual', 'street', 'party', 'minimal'], fit: 'slim', rating: 4.5, reviews: 1875, material: 'деним, хлопок 92%, эластан 8%', seasons: ['autumn', 'winter', 'spring', 'summer'], desc: 'Тёмный деним под всё.' },
  { id: 'p11', title: 'Брюки карго olive', price: 3990, old: 5600, img: U('1624378439575-d8705ad7ae80'), mp: 'OZON', brand: 'H&M', cat: 'bottom', colors: ['olive', 'green'], sizes: ['M', 'L', 'XL'], styles: ['street', 'casual', 'tech', 'oversize'], fit: 'relaxed', rating: 4.4, reviews: 690, material: 'хлопок 100%, саржа', seasons: ['autumn', 'spring', 'summer'], desc: 'Расслабленный низ для streetwear.' },
  { id: 'p12', title: 'Кроссовки белые минималистичные', price: 4190, old: 6500, img: U('1552346154-21d32810aba3'), mp: 'OZON', brand: 'Nike', cat: 'shoes', colors: ['white'], sizes: ['42', '43', '44', '45'], styles: ['casual', 'minimal', 'smart', 'sport'], fit: 'regular', rating: 4.9, reviews: 6230, material: 'кожа, текстиль', seasons: ['spring', 'summer', 'autumn'], desc: 'Чистые белые кроссовки.' },
  { id: 'p13', title: 'Кроссовки беговые серые', price: 5990, old: 8400, img: U('1549298916-b41d501d3772'), mp: 'WB', brand: 'Nike', cat: 'shoes', colors: ['gray', 'white'], sizes: ['42', '43', '44'], styles: ['sport', 'casual', 'street'], fit: 'regular', rating: 4.7, reviews: 2890, material: 'синтетика, mesh', seasons: ['spring', 'summer', 'autumn'], desc: 'Спорт-пара для активных дней.' },
  { id: 'p14', title: 'Кеды белые классика', price: 3490, old: 4990, img: U('1588850561407-ed78c282e89b'), mp: 'WB', brand: 'Adidas', cat: 'shoes', colors: ['white'], sizes: ['41', '42', '43', '44', '45'], styles: ['minimal', 'smart', 'classic', 'casual'], fit: 'regular', rating: 4.8, reviews: 4150, material: 'кожа', seasons: ['spring', 'summer', 'autumn'], desc: 'Низкий силуэт под прямые брюки.' },
  { id: 'p15', title: 'Кроссовки высокие чёрные', price: 5490, old: 7900, img: U('1595950653106-6c9ebd614d3a'), mp: 'OZON', brand: 'Puma', cat: 'shoes', colors: ['black'], sizes: ['42', '43', '44'], styles: ['street', 'oversize', 'party'], fit: 'regular', rating: 4.6, reviews: 1340, material: 'кожа, текстиль', seasons: ['autumn', 'spring'], desc: 'Дерзкая пара для вечера.' },
  { id: 'p16', title: 'Ботинки челси чёрные', price: 7990, old: 10900, img: U('1608234807905-4466023792f5'), mp: 'OZON', brand: 'Mango', cat: 'shoes', colors: ['black'], sizes: ['42', '43', '44'], styles: ['smart', 'business', 'party', 'classic', 'oldmoney'], fit: 'regular', rating: 4.7, reviews: 720, material: 'экокожа', seasons: ['autumn', 'winter', 'spring'], desc: 'Делают образ дороже.' },
  { id: 'p17', title: 'Рюкзак чёрный minimal', price: 2490, old: 3800, img: U('1553062407-98eeb64c6a62'), mp: 'WB', brand: 'Base', cat: 'acc', colors: ['black'], sizes: ['One'], styles: ['casual', 'minimal', 'smart', 'tech'], fit: 'regular', rating: 4.6, reviews: 1560, material: 'полиэстер 900D', seasons: ['autumn', 'winter', 'spring', 'summer'], desc: 'Чистый рюкзак без логотипов.' },
  { id: 'p18', title: 'Часы классические', price: 4990, old: 7500, img: U('1523275335684-37898b6baf30'), mp: 'OZON', brand: 'Casio', cat: 'acc', colors: ['black', 'brown'], sizes: ['One'], styles: ['smart', 'business', 'classic', 'oldmoney', 'party'], fit: 'regular', rating: 4.8, reviews: 2310, material: 'сталь, минеральное стекло', seasons: ['autumn', 'winter', 'spring', 'summer'], desc: 'Образ становится собранным.' },
  { id: 'p19', title: 'Кепка чёрная', price: 1290, old: 1900, img: U('1556306535-0f09a537f0a3'), mp: 'WB', brand: 'Nike', cat: 'acc', colors: ['black'], sizes: ['One'], styles: ['casual', 'sport', 'street'], fit: 'regular', rating: 4.5, reviews: 3420, material: 'хлопок 100%', seasons: ['spring', 'summer', 'autumn'], desc: 'Для расслабленных дней.' },
  { id: 'p20', title: 'Очки солнцезащитные', price: 1990, old: 3200, img: U('1572635196237-14b3f281503f'), mp: 'WB', brand: 'Base', cat: 'acc', colors: ['black'], sizes: ['One'], styles: ['casual', 'party', 'classic', 'oldmoney'], fit: 'regular', rating: 4.4, reviews: 980, material: 'ацетат, UV400', seasons: ['spring', 'summer'], desc: 'Завершают летний образ.' },
  { id: 'p21', title: 'Футболка оверсайз чёрная', price: 1490, old: 2200, img: U('1576566588028-4147f3842f27'), mp: 'OZON', brand: 'H&M', cat: 'top', colors: ['black'], sizes: ['M', 'L', 'XL', 'XXL'], styles: ['street', 'oversize', 'minimal', 'casual'], fit: 'relaxed', rating: 4.6, reviews: 2140, material: 'хлопок 100%, 220 г/м²', seasons: ['spring', 'summer', 'autumn'], desc: 'Свободная посадка, плотный хлопок.' },
  { id: 'p22', title: 'Рубашка белая классика', price: 2490, old: 3600, img: U('1562157873-818bc0726f68'), mp: 'WB', brand: 'Zara', cat: 'top', colors: ['white'], sizes: ['M', 'L', 'XL'], styles: ['smart', 'business', 'classic', 'oldmoney', 'party'], fit: 'regular', rating: 4.7, reviews: 1690, material: 'хлопок 100%, поплин', seasons: ['autumn', 'winter', 'spring', 'summer'], desc: 'Строгий верх для вечера.' },
  { id: 'p23', title: 'Свитшот песочный', price: 1990, old: 2900, img: U('1611312449408-fcece27cdbb7'), mp: 'WB', brand: 'Uniqlo', cat: 'top', colors: ['beige'], sizes: ['S', 'M', 'L', 'XL'], styles: ['casual', 'minimal', 'oldmoney'], fit: 'regular', rating: 4.5, reviews: 1410, material: 'хлопок 80%, полиэстер 20%', seasons: ['autumn', 'winter', 'spring'], desc: 'Тёплый нейтральный слой.' },
  { id: 'p24', title: 'Джинсовая куртка', price: 4490, old: 6800, img: U('1523205771623-e0faa4d2813d'), mp: 'OZON', brand: "Levi's", cat: 'top', colors: ['blue'], sizes: ['M', 'L', 'XL'], styles: ['casual', 'classic', 'street'], fit: 'regular', rating: 4.6, reviews: 1150, material: 'деним 12 oz', seasons: ['spring', 'autumn'], desc: 'Второй слой на весну.' }
];
function mpSearchUrl(p) {
  const q = encodeURIComponent(p.title);
  return p.mp === 'WB' ? `https://www.wildberries.ru/catalog/0/search.aspx?search=${q}` : `https://www.ozon.ru/search/?text=${q}`;
}
/* Демо-отзывы по категориям: честно помечены source:'demo'. */
const REVIEW_POOL = {
  top: [
    { author: 'Дмитрий', rating: 5, text: 'Материал приятный, сидит хорошо, соответствует фото.' },
    { author: 'Алексей', rating: 5, text: 'Качество отличное за свои деньги. Размер совпал.' },
    { author: 'Игорь', rating: 4, text: 'Хорошая вещь, но немного маломерит — берите с запасом.' }
  ],
  bottom: [
    { author: 'Сергей', rating: 5, text: 'Посадка отличная, ткань плотная. Ношу каждый день.' },
    { author: 'Максим', rating: 4, text: 'Хорошие брюки, длина чуть большая — подвернул.' },
    { author: 'Дмитрий', rating: 5, text: 'Соответствуют описанию, цвет как на фото.' }
  ],
  shoes: [
    { author: 'Артём', rating: 5, text: 'Удобные, колодка комфортная. Размер в размер.' },
    { author: 'Никита', rating: 4, text: 'Хорошие, но первые дни немного жмут.' },
    { author: 'Павел', rating: 5, text: 'Выглядят дороже своей цены. Рекомендую.' }
  ],
  acc: [
    { author: 'Ольга', rating: 5, text: 'Подарила мужу — доволен, выглядит стильно.' },
    { author: 'Денис', rating: 5, text: 'Качество хорошее, соответствует фотографиям.' },
    { author: 'Марина', rating: 4, text: 'Неплохо, но упаковка была мятой.' }
  ]
};
function getReviews(productId) {
  const p = PRODUCTS.find((x) => x.id === productId);
  if (!p) return null;
  return { productId, source: 'demo', rating: p.rating, count: p.reviews, reviews: REVIEW_POOL[p.cat] || [] };
}
/* Детерминированный демо-анализ товара (Product AI без ключа). */
function demoAnalysis(p) {
  const q = Math.round((p.rating / 5) * 100);
  const pos = (REVIEW_POOL[p.cat] || []).filter((r) => r.rating >= 5).map((r) => r.text.split('.')[0].toLowerCase());
  const neg = (REVIEW_POOL[p.cat] || []).filter((r) => r.rating < 5).map((r) => r.text.split('.')[0].toLowerCase());
  return {
    productId: p.id, source: 'demo',
    category: p.cat, colors: p.colors, fit: p.fit, styles: p.styles, seasons: p.seasons,
    material: p.material,
    confidence: p.reviews >= 1000 ? 0.8 : p.reviews >= 300 ? 0.6 : 0.42,
    quality_signals: { material: Math.min(98, q - 2), construction: Math.min(98, q - 4), reviews: Math.min(98, q) },
    value_for_money: p.old > p.price ? Math.min(97, q + 3) : q - 3,
    review_summary: { positive: pos.slice(0, 3), negative: neg.slice(0, 2) }
  };
}
const DemoProductProvider = {
  name: 'demo',
  search(q) {
    let list = PRODUCTS.slice();
    if (q && q.category) list = list.filter((p) => p.cat === q.category);
    if (q && q.color) list = list.filter((p) => p.colors.includes(q.color));
    if (q && q.maxPrice) list = list.filter((p) => p.price <= q.maxPrice);
    if (q && q.style) list = list.filter((p) => p.styles.includes(q.style));
    return list;
  },
  getById(id) { return PRODUCTS.find((p) => p.id === id) || null; }
};
/* Production-заглушки: честно сообщают об отсутствии источника, не выдумывают данные. */
function noSource(mp) {
  const e = new Error(`Нет подключённого источника ${mp}: нужен backend-proxy и ключ. Сейчас активен DemoProvider.`);
  e.code = 'NO_SOURCE'; e.status = 503; throw e;
}
const WildberriesProvider = { name: 'wildberries', search: () => noSource('Wildberries'), getById: () => noSource('Wildberries') };
const OzonProvider = { name: 'ozon', search: () => noSource('Ozon'), getById: () => noSource('Ozon') };
module.exports = { PRODUCTS, mpSearchUrl, getReviews, demoAnalysis, DemoProductProvider, WildberriesProvider, OzonProvider };
