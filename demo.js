/* demo.js — автономный демо-движок для статического хостинга (GitHub Pages).
   Используется ТОЛЬКО когда backend недоступен (Api.ok === false).
   Данные и математика — те же, что в backend, но локально и без AI. */
'use strict';
const Demo = (() => {
  const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;
  const PRODUCTS = [
    { id: 'p01', title: 'Худи оверсайз с начёсом', price: 2890, old: 4900, img: U('1556821840-3a63f95609a7'), mp: 'WB', brand: 'Base', cat: 'top', colors: ['black'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], styles: ['casual', 'street', 'oversize', 'minimal'], fit: 'relaxed', rating: 4.8, desc: 'Плотный хлопок 320 г/м², начёс, свободный крой.' },
    { id: 'p02', title: 'Футболка базовая белая', price: 1290, old: 1990, img: U('1521572163474-6864f9cf17ab'), mp: 'WB', brand: 'Uniqlo', cat: 'top', colors: ['white'], sizes: ['S', 'M', 'L', 'XL'], styles: ['casual', 'minimal', 'smart', 'classic'], fit: 'regular', rating: 4.9, desc: 'Хлопок, прямой крой, не просвечивает.' },
    { id: 'p03', title: 'Рубашка-overshirt бежевая', price: 4790, old: 6900, img: U('1596755094514-f87e34085b2c'), mp: 'OZON', brand: 'Mango', cat: 'top', colors: ['beige'], sizes: ['M', 'L', 'XL'], styles: ['smart', 'minimal', 'casual', 'oldmoney'], fit: 'regular', rating: 4.7, desc: 'Носи как рубашку или лёгкую куртку.' },
    { id: 'p04', title: 'Куртка кожаная чёрная', price: 8990, old: 12900, img: U('1551028719-00167b16eac5'), mp: 'OZON', brand: 'Zara', cat: 'top', colors: ['black'], sizes: ['M', 'L', 'XL'], styles: ['street', 'party', 'classic'], fit: 'regular', rating: 4.6, desc: 'Акцентный верх для вечера.' },
    { id: 'p05', title: 'Куртка field olive', price: 7490, old: 9900, img: U('1591047139829-d91aecb6caea'), mp: 'WB', brand: 'H&M', cat: 'top', colors: ['olive', 'green'], sizes: ['S', 'M', 'L', 'XL'], styles: ['casual', 'minimal', 'street', 'classic'], fit: 'regular', rating: 4.7, desc: 'Оливковая куртка — ключевой цвет профиля.' },
    { id: 'p06', title: 'Лонгслив серый regular', price: 1590, old: 2400, img: U('1618354691373-d851c5c3a990'), mp: 'WB', brand: 'Base', cat: 'top', colors: ['gray'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], styles: ['casual', 'minimal', 'sport'], fit: 'regular', rating: 4.5, desc: 'Спокойный базовый слой.' },
    { id: 'p07', title: 'Брюки прямые чёрные', price: 2990, old: 4500, img: U('1594938298603-c8148c4dae35'), mp: 'WB', brand: 'Mango', cat: 'bottom', colors: ['black'], sizes: ['30', '31', '32', '33', '34'], styles: ['smart', 'minimal', 'business', 'classic'], fit: 'straight', rating: 4.8, desc: 'Прямой крой, средняя посадка.' },
    { id: 'p08', title: 'Джинсы прямые синие', price: 3490, old: 5200, img: U('1542272604-787c3835535d'), mp: 'OZON', brand: "Levi's", cat: 'bottom', colors: ['blue'], sizes: ['30', '31', '32', '33'], styles: ['casual', 'classic', 'street'], fit: 'straight', rating: 4.8, desc: 'Классика без потёртостей.' },
    { id: 'p09', title: 'Чиносы бежевые', price: 2790, old: 3900, img: U('1473966968600-fa801b869a1a'), mp: 'WB', brand: 'Uniqlo', cat: 'bottom', colors: ['beige'], sizes: ['30', '31', '32', '33', '34'], styles: ['smart', 'minimal', 'oldmoney', 'business'], fit: 'straight', rating: 4.6, desc: 'Светлый низ для контраста.' },
    { id: 'p10', title: 'Джинсы чёрные slim-straight', price: 3290, old: 4800, img: U('1541099649105-f69ad21f3246'), mp: 'WB', brand: 'Zara', cat: 'bottom', colors: ['black'], sizes: ['31', '32', '33'], styles: ['casual', 'street', 'party', 'minimal'], fit: 'slim', rating: 4.5, desc: 'Тёмный деним под всё.' },
    { id: 'p11', title: 'Брюки карго olive', price: 3990, old: 5600, img: U('1624378439575-d8705ad7ae80'), mp: 'OZON', brand: 'H&M', cat: 'bottom', colors: ['olive', 'green'], sizes: ['M', 'L', 'XL'], styles: ['street', 'casual', 'tech', 'oversize'], fit: 'relaxed', rating: 4.4, desc: 'Расслабленный низ для streetwear.' },
    { id: 'p12', title: 'Кроссовки белые минималистичные', price: 4190, old: 6500, img: U('1552346154-21d32810aba3'), mp: 'OZON', brand: 'Nike', cat: 'shoes', colors: ['white'], sizes: ['42', '43', '44', '45'], styles: ['casual', 'minimal', 'smart', 'sport'], fit: 'regular', rating: 4.9, desc: 'Чистые белые кроссовки.' },
    { id: 'p13', title: 'Кроссовки беговые серые', price: 5990, old: 8400, img: U('1549298916-b41d501d3772'), mp: 'WB', brand: 'Nike', cat: 'shoes', colors: ['gray', 'white'], sizes: ['42', '43', '44'], styles: ['sport', 'casual', 'street'], fit: 'regular', rating: 4.7, desc: 'Спорт-пара для активных дней.' },
    { id: 'p14', title: 'Кеды белые классика', price: 3490, old: 4990, img: U('1588850561407-ed78c282e89b'), mp: 'WB', brand: 'Adidas', cat: 'shoes', colors: ['white'], sizes: ['41', '42', '43', '44', '45'], styles: ['minimal', 'smart', 'classic', 'casual'], fit: 'regular', rating: 4.8, desc: 'Низкий силуэт под прямые брюки.' },
    { id: 'p15', title: 'Кроссовки высокие чёрные', price: 5490, old: 7900, img: U('1595950653106-6c9ebd614d3a'), mp: 'OZON', brand: 'Puma', cat: 'shoes', colors: ['black'], sizes: ['42', '43', '44'], styles: ['street', 'oversize', 'party'], fit: 'regular', rating: 4.6, desc: 'Дерзкая пара для вечера.' },
    { id: 'p16', title: 'Ботинки челси чёрные', price: 7990, old: 10900, img: U('1608234807905-4466023792f5'), mp: 'OZON', brand: 'Mango', cat: 'shoes', colors: ['black'], sizes: ['42', '43', '44'], styles: ['smart', 'business', 'party', 'classic', 'oldmoney'], fit: 'regular', rating: 4.7, desc: 'Делают образ дороже.' },
    { id: 'p17', title: 'Рюкзак чёрный minimal', price: 2490, old: 3800, img: U('1553062407-98eeb64c6a62'), mp: 'WB', brand: 'Base', cat: 'acc', colors: ['black'], sizes: ['One'], styles: ['casual', 'minimal', 'smart', 'tech'], fit: 'regular', rating: 4.6, desc: 'Чистый рюкзак без логотипов.' },
    { id: 'p18', title: 'Часы классические', price: 4990, old: 7500, img: U('1523275335684-37898b6baf30'), mp: 'OZON', brand: 'Casio', cat: 'acc', colors: ['black', 'brown'], sizes: ['One'], styles: ['smart', 'business', 'classic', 'oldmoney', 'party'], fit: 'regular', rating: 4.8, desc: 'Образ становится собранным.' },
    { id: 'p19', title: 'Кепка чёрная', price: 1290, old: 1900, img: U('1556306535-0f09a537f0a3'), mp: 'WB', brand: 'Nike', cat: 'acc', colors: ['black'], sizes: ['One'], styles: ['casual', 'sport', 'street'], fit: 'regular', rating: 4.5, desc: 'Для расслабленных дней.' },
    { id: 'p20', title: 'Очки солнцезащитные', price: 1990, old: 3200, img: U('1572635196237-14b3f281503f'), mp: 'WB', brand: 'Base', cat: 'acc', colors: ['black'], sizes: ['One'], styles: ['casual', 'party', 'classic', 'oldmoney'], fit: 'regular', rating: 4.4, desc: 'Завершают летний образ.' },
    { id: 'p21', title: 'Футболка оверсайз чёрная', price: 1490, old: 2200, img: U('1576566588028-4147f3842f27'), mp: 'OZON', brand: 'H&M', cat: 'top', colors: ['black'], sizes: ['M', 'L', 'XL', 'XXL'], styles: ['street', 'oversize', 'minimal', 'casual'], fit: 'relaxed', rating: 4.6, desc: 'Свободная посадка, плотный хлопок.' },
    { id: 'p22', title: 'Рубашка белая классика', price: 2490, old: 3600, img: U('1562157873-818bc0726f68'), mp: 'WB', brand: 'Zara', cat: 'top', colors: ['white'], sizes: ['M', 'L', 'XL'], styles: ['smart', 'business', 'classic', 'oldmoney', 'party'], fit: 'regular', rating: 4.7, desc: 'Строгий верх для вечера.' },
    { id: 'p23', title: 'Свитшот песочный', price: 1990, old: 2900, img: U('1611312449408-fcece27cdbb7'), mp: 'WB', brand: 'Uniqlo', cat: 'top', colors: ['beige'], sizes: ['S', 'M', 'L', 'XL'], styles: ['casual', 'minimal', 'oldmoney'], fit: 'regular', rating: 4.5, desc: 'Тёплый нейтральный слой.' },
    { id: 'p24', title: 'Джинсовая куртка', price: 4490, old: 6800, img: U('1523205771623-e0faa4d2813d'), mp: 'OZON', brand: "Levi's", cat: 'top', colors: ['blue'], sizes: ['M', 'L', 'XL'], styles: ['casual', 'classic', 'street'], fit: 'regular', rating: 4.6, desc: 'Второй слой на весну.' }
  ];
  const REVIEWS = {
    top: [{ author: 'Дмитрий', rating: 5, text: 'Материал приятный, сидит хорошо.' }, { author: 'Игорь', rating: 4, text: 'Хорошая вещь, но немного маломерит.' }],
    bottom: [{ author: 'Сергей', rating: 5, text: 'Посадка отличная, ткань плотная.' }, { author: 'Максим', rating: 4, text: 'Длина чуть большая — подвернул.' }],
    shoes: [{ author: 'Артём', rating: 5, text: 'Удобные, размер в размер.' }, { author: 'Никита', rating: 4, text: 'Первые дни немного жмут.' }],
    acc: [{ author: 'Денис', rating: 5, text: 'Качество хорошее, как на фото.' }, { author: 'Марина', rating: 4, text: 'Неплохо, но упаковка мятая.' }]
  };
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  function score(p, profile, fb) {
    fb = fb || {};
    const ps = profile.styles || [], pc = profile.colors || [];
    const hit = p.styles.filter((s) => ps.includes(s)).length;
    let style = ps.length ? 55 + 45 * (hit / Math.max(1, Math.min(2, ps.length))) : 70;
    const chit = p.colors.filter((c) => pc.includes(c)).length;
    let color = pc.length ? (chit > 0 ? 88 : 58) : 70;
    const need = p.cat === 'shoes' ? profile.shoeSize : p.cat === 'bottom' ? profile.pantsSize : profile.topSize;
    const size = (p.sizes.includes(String(need)) || p.sizes.includes('One')) ? 100 : 42;
    const b = +profile.budget || 5000;
    const budget = p.price <= b ? 100 : p.price <= b * 1.25 ? 68 : 40;
    let pref = 72;
    if (fb.likes && fb.likes[p.id]) pref = 100;
    if (fb.dislikes && fb.dislikes[p.id]) pref = 30;
    const wr = (fb.wardrobe || []).reduce((a, w) => a + (w.styles || []).filter((s) => p.styles.includes(s)).length * 3 + (w.colors || []).filter((c) => p.colors.includes(c)).length * 2, 0);
    pref = clamp(pref + Math.min(10, wr));
    const quality = clamp((p.rating / 5) * 100 - 2);
    const parts = { style: clamp(style), color: clamp(color), body: 88, size, budget, pref, quality, season: 85 };
    const W = { style: .25, color: .15, body: .15, size: .15, budget: .1, pref: .1, quality: .05, season: .05 };
    const score = parts.style * W.style + parts.color * W.color + parts.body * W.body + parts.size * W.size + parts.budget * W.budget + parts.pref * W.pref + parts.quality * W.quality + parts.season * W.season;
    return { score: Math.max(58, Math.min(98, Math.round(score))), parts };
  }
  function rank(list, profile, fb) {
    return list.map((p) => { const r = score(p, profile, fb); return Object.assign({}, p, { aiScore: r.score, aiParts: r.parts }); }).sort((a, b) => b.aiScore - a.aiScore);
  }
  function parse(q) {
    const s = (q || '').toLowerCase();
    const r = { category: '', color: '', maxPrice: null, occasion: '' };
    [['худи|толстов|футбол|рубаш|куртк|пальто|бомбер|свитшот|лонгслив', 'top'], ['брюк|джинс|чинос|карго', 'bottom'], ['кроссов|кед|ботин|челси', 'shoes'], ['рюкзак|часы|кепк|очк', 'acc']].forEach(([re, v]) => { if (new RegExp(re).test(s)) r.category = v; });
    [['чёрн|черн', 'black'], ['бел', 'white'], ['олив', 'olive'], ['беж', 'beige'], ['сер', 'gray'], ['зелен|зелён', 'green'], ['син|голуб', 'blue'], ['коричн', 'brown']].forEach(([re, v]) => { if (new RegExp(re).test(s)) r.color = v; });
    const m = s.replace(/\s/g, '').match(/до(\d+)/);
    if (m) r.maxPrice = parseInt(m[1], 10);
    if (s.includes('осен')) r.occasion = 'autumn';
    if (s.includes('свидан') || s.includes('день рождения')) r.occasion = 'date';
    return r;
  }
  function search(struct, profile, fb) {
    let list = PRODUCTS.slice();
    if (struct.category) list = list.filter((p) => p.cat === struct.category);
    if (struct.color) list = list.filter((p) => p.colors.includes(struct.color));
    if (struct.maxPrice) list = list.filter((p) => p.price <= struct.maxPrice);
    return rank(list, profile, fb);
  }
  function brain(text, profile) {
    const st = parse(text);
    const hasQ = st.category || st.color || st.maxPrice;
    let message;
    if (/привет|здравствуй/i.test(text)) message = `Привет, ${profile.name || 'друг'}! Скажи, что подобрать — например «куртка на осень до 7000».`;
    else if (st.occasion === 'date') message = 'Для свидания соберу smart-вариант: рубашка, прямые брюки, чистая обувь.';
    else if (st.occasion === 'autumn') message = 'На осень возьмём второй слой: куртка или overshirt плюс джинсы.';
    else if (hasQ) message = 'Понял запрос. Показываю лучшее по твоему профилю — это демо-режим витрины.';
    else message = 'Подберу варианты в пределах твоего бюджета. Уточни категорию, цвет или повод.';
    const items = search(st, profile, {});
    return { message, ids: items.slice(0, 8).map((p) => p.id), items, total: items.length };
  }
  function outfits(ranked, profile) {
    const pick = (c) => ranked.filter((p) => p.cat === c);
    const tops = pick('top'), bots = pick('bottom'), shoes = pick('shoes'), accs = pick('acc');
    const out = [];
    for (let i = 0; i < 2; i++) {
      const t = tops[i % tops.length], b = bots[i % bots.length], s = shoes[i % shoes.length], a = accs[(i + 1) % accs.length];
      const items = [t, b, s].concat(i % 2 === 0 && a ? [a] : []);
      const total = items.reduce((x, y) => x + y.price, 0);
      out.push({ id: 'demo-o' + i, name: i === 0 ? 'Демо-образ · smart casual' : 'Демо-образ №2', items: items.map((x) => x.id), total, score: Math.round(items.reduce((x, y) => x + y.aiScore, 0) / items.length) });
    }
    return out;
  }
  function insights(items) {
    const cc = {}, sc = {}, cats = { top: 0, bottom: 0, shoes: 0, acc: 0 };
    (items || []).forEach((w) => { (w.colors || []).forEach((c) => { cc[c] = (cc[c] || 0) + 1; }); (w.styles || []).forEach((s) => { sc[s] = (sc[s] || 0) + 1; }); if (cats[w.cat] !== undefined) cats[w.cat]++; });
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
    const gaps = Object.keys(cats).filter((c) => !cats[c]);
    return { count: (items || []).length, colors: top(cc, 3), styles: top(sc, 3), gaps, note: !(items || []).length ? 'Гардероб пуст — добавь пару вещей.' : `Вижу ${(items || []).length}: цвета ${top(cc, 3).join(', ') || '—'}; ${gaps.length ? 'не хватает: ' + gaps.join(', ') : 'все категории закрыты'}.` };
  }
  return { PRODUCTS, REVIEWS, score, rank, parse, search, brain, outfits, insights, find: (id) => PRODUCTS.find((p) => p.id === id) };
})();
