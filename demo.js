/* demo.js — автономный демо-движок для статического хостинга (GitHub Pages).
   Используется ТОЛЬКО когда backend недоступен (Api.ok === false).
   Данные и математика — те же, что в backend, но локально и без AI. */
'use strict';
const Demo = (() => {
  const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;
  const PRODUCTS = [];
  const REVIEWS = {};
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
  function stemRU(w) {
    w = String(w || '').toLowerCase().replace(/ё/g, 'е');
    if (w.length <= 4) return w;
    return w.replace(/(иями|ями|ами|ией|ей|ой|ий|ый|ую|юю|ая|яя|ое|ее|ые|ие|а|я|ы|и|у|ю|е|о|ь)$/, '');
  }
  const SUBS = [['tshirt', ['футболк']], ['shirt', ['рубаш', 'блуз']], ['hoodie', ['худи', 'толстов', 'свитшот']], ['jacket', ['куртк', 'ветровк', 'пуховик', 'бомбер', 'жилет', 'пальто', 'плащ', 'парк', 'дубленк']], ['dress', ['плать', 'сарафан']], ['sweater', ['свитер', 'джемпер', 'кардиган', 'водолазк', 'пуловер']], ['suit', ['костюм']], ['robe', ['халат']], ['jeans', ['джинс']], ['pants', ['брюк', 'чинос', 'карго']], ['shorts', ['шорт']], ['skirt', ['юбк']], ['sneakers', ['кроссов', 'кед']], ['boots', ['ботин', 'челси']], ['bag', ['сумк', 'рюкзак']], ['watch', ['часы']], ['cap', ['кепк']], ['hat', ['шапк']], ['wallet', ['кошел']]];
  function parse(q) {
    const s = (q || '').toLowerCase();
    const r = { category: '', subcategory: '', color: '', maxPrice: null, occasion: '' };
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
    else if (hasQ) message = 'Понял запрос. Показываю лучшее по твоему профилю.';
    else message = 'Подберу варианты в пределах твоего бюджета. Уточни категорию, цвет или повод.';
    const items = search(st, profile, {});
    return { message, ids: items.slice(0, 8).map((p) => p.id), items, total: items.length };
  }
  function outfits(ranked, profile) {
    const pick = (c) => ranked.filter((p) => p.cat === c);
    const tops = pick('top'), bots = pick('bottom'), shoes = pick('shoes'), accs = pick('acc');
    if (!tops.length || !bots.length || !shoes.length) return [];
    const out = [];
    for (let i = 0; i < 2; i++) {
      const t = tops[i % tops.length], b = bots[i % bots.length], s = shoes[i % shoes.length], a = accs[(i + 1) % accs.length];
      const items = [t, b, s].concat(i % 2 === 0 && a ? [a] : []);
      const total = items.reduce((x, y) => x + y.price, 0);
      out.push({ id: 'demo-o' + i, name: i === 0 ? 'Образ · smart casual' : 'Образ №2', items: items.map((x) => x.id), total, score: Math.round(items.reduce((x, y) => x + y.aiScore, 0) / items.length) });
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
