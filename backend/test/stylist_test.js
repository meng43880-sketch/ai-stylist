'use strict';
/* Офлайн-тесты нового слоя (без сети и AI-ключей). Запуск: node backend/test/stylist_test.js */
process.chdir(__dirname + '/..');
const R = require('../lib/recommend');
const P = require('../lib/persona');
const RV = require('../lib/reviews');
const STY = require('../lib/stylist');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('ok   ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + x : '')); } };
const prof = { gender: 'male', build: 'average', budget: 5000, topSize: 'L', pantsSize: '32', shoeSize: '43', styles: ['minimal'], colors: ['olive', 'beige'] };
const mk = (id, cat, colors, extra) => Object.assign({ id, title: id, cat, colors, styles: ['minimal'], sizes: ['L', '32', '43'], price: 2000, fit: 'regular', rating: 4.5, reviews: 100, seasons: ['autumn'] }, extra || {});

/* честные факторы */
{
  const live = { id: 'wb1', title: 'Футболка мужская', price: 900, cat: 'top', colors: [], styles: [], sizes: ['L'], live: true, source: 'wb', fit: 'regular', seasons: ['spring', 'summer', 'autumn', 'winter'], rating: 0, reviews: 0 };
  const r = R.scoreProduct(live, { profile: prof, feedback: {}, wardrobe: [] });
  ok(r.parts.style === null && r.parts.color === null && r.parts.body === null && r.parts.season === null, 'S1 нет данных = null');
  ok(r.parts.wardrobe === null && r.parts.pref === null && r.parts.quality === null, 'S2 гардероб/оценки без данных = null');
  ok(r.conf < 0.5, 'S3 низкая уверенность', String(r.conf));
  const oversize = R.scoreProduct(Object.assign({}, live, { title: 'Футболка оверсайз' }), { profile: prof, feedback: {} });
  ok(oversize.parts.body !== null, 'S4 крой из названия');
  const warm = R.scoreProduct(Object.assign({}, live, { title: 'Куртка утеплённая' }), { profile: prof, feedback: {}, temp: 3 });
  const light = R.scoreProduct(Object.assign({}, live, { title: 'Футболка летняя' }), { profile: prof, feedback: {}, temp: 3 });
  ok(warm.parts.season > light.parts.season, 'S5 погода: тёплая лучше летней при +3', warm.parts.season + ' vs ' + light.parts.season);
  const demo = R.scoreProduct(mk('d1', 'top', ['olive']), { profile: prof, feedback: {} });
  ok(demo.conf > r.conf, 'S6 у полного товара уверенность выше');
}
/* сочетаемость цветов и образы */
{
  ok(R.colorCompat('olive', 'beige') > R.colorCompat('black', 'brown'), 'C1 олива+беж лучше чёрный+коричневый');
  ok(R.colorCompat('white', 'blue') === 1, 'C2 белый+синий');
  const items = [
    mk('t1', 'top', ['olive'], { aiScore: 80 }), mk('t2', 'top', ['black'], { aiScore: 80 }),
    mk('b1', 'bottom', ['beige'], { aiScore: 80 }), mk('b2', 'bottom', ['brown'], { aiScore: 80 }),
    mk('s1', 'shoes', ['white'], { aiScore: 80 }), mk('s2', 'shoes', ['brown'], { aiScore: 80 })
  ];
  const outs = R.buildOutfits(items, prof, 3, { temp: 10, budget: 20000 });
  ok(outs.length >= 1, 'O1 образы собираются');
  ok(!(outs[0].items.includes('t2') && outs[0].items.includes('b2')), 'O2 лучший образ без чёрный+коричневый');
  ok(outs[0].why.length >= 1, 'O3 причины из данных');
  if (outs.length > 1) { const a = outs[0].items, b = outs[1].items; ok(a.filter((x) => b.includes(x)).length <= a.length - 2, 'O4 образы различаются минимум на 2 вещи'); }
  const own = Object.assign(mk('own1', 'bottom', ['black'], { aiScore: 78, own: true, price: 0, ownTitle: 'чёрные джинсы' }));
  const o2 = R.buildOutfits(items.concat([own]), prof, 3, { budget: 20000 });
  ok(o2.some((o) => o.ownCount > 0), 'O5 свои вещи участвуют');
  ok(R.buildOutfits([items[0]], prof, 3).length === 0, 'O6 нет обуви — нет образа');
}
/* причины */
{
  const rs = R.reasonsFor(mk('x', 'top', ['olive']), prof, { temp: 8 });
  ok(rs.why.some((w) => /палитр/.test(w)) && rs.why.some((w) => /размер/.test(w)), 'W1 причины: цвет и размер');
  const w2 = R.reasonsFor(mk('y', 'top', ['olive'], { seasons: ['summer'] }), prof, { temp: 2 });
  ok(w2.warn.some((w) => /погод/.test(w)), 'W2 предупреждение о погоде');
}
/* проверка ответа модели */
{
  const good = { message: 'Понял: куртка на осень до 7 000 ₽. Смотрю на плотные варианты.', picks: [{ id: 'a', reason: 'твой размер есть' }, { id: 'zzz', reason: 'чужой id' }], question: null, quick: [] };
  const v = P.validateSay(good, ['a', 'b']);
  ok(v && v.picks.length === 1 && v.picks[0].id === 'a', 'V1 чужой id отброшен');
  ok(P.validateSay({ message: 'Here is a nice jacket for you, I think you will love it', picks: [] }, []) === null, 'V2 английский текст отклонён');
  ok(P.validateSay({ message: 'Ок', picks: [] }, []) === null, 'V3 слишком короткий отклонён');
  const q = P.validateSay({ message: 'Подскажи, куда идёшь — от этого зависит образ.', picks: [], question: 'Куда идёте?', quick: ['Ресторан', 'Кино', 'x'.repeat(40)] }, []);
  ok(q && q.quick.length === 2 && q.question, 'V4 быстрые ответы фильтруются');
  ok(P.templateSay({ category: 'top' }, [], 5).message.length > 10, 'V5 шаблон при пустом поиске');
  const u = P.normUnderstand({ intent: 'wat', hard: { category: 'xxx', maxPrice: 'abc' }, soft: { colors: ['black', 'pink'] }, learned: [{ dim: 'colors', key: 'black', like: false }, { dim: 'bad', key: 'x' }] });
  ok(u.intent === 'find_item' && u.hard.category === '' && u.hard.maxPrice === null && u.soft.colors.length === 1 && u.learned.length === 1 && u.learned[0].like === false, 'V6 понимание нормализуется');
}
/* отзывы: считает код */
{
  const revs = [
    { text: 'Нейросеть Wildberries: хорошее качество, приятная ткань, не садится', rating: 0 },
    { text: 'Футболка очень маломерит, пришлось вернуть, ткань тонкая', rating: 2 },
    { text: 'Нитки торчат, швы кривые, цвет не как на фото', rating: 1 },
    { text: 'Отличная вещь, села идеально, подошла в размер', rating: 5 },
    { text: 'Ткань тонкая и просвечивает, но размер подошёл', rating: 3 },
    { text: 'Хороший товар, качественный хлопок, рекомендую', rating: 0 }
  ];
  const a = RV.analyze(revs);
  ok(a.count === 5, 'R1 блок «Нейросеть WB» не считается отзывом', String(a.count));
  ok(a.rated === 4 && a.avg === 2.8, 'R2 средняя только по оценённым', String(a.avg));
  ok(a.neg === 2 && a.pos === 1, 'R3 нулевая оценка не считается отрицательной', a.neg + '/' + a.pos);
  ok(a.size.small === 1 && a.size.ok >= 2, 'R4 размер из текста', JSON.stringify(a.size));
  ok(a.themes.some((t) => t.key === 'thin' && t.count === 2), 'R5 тема «тонкая ткань» = 2');
  const none = RV.analyze([{ text: 'просто отзыв без оценки про качество', rating: 0 }]);
  ok(none.avg === null && none.neg === 0, 'R6 нет оценок — нет средней');
  ok(/не распознаны/.test(RV.templateVerdict(none)), 'R7 честная пометка про оценки');
  const notneg = RV.analyze([{ text: 'Совсем не маломерит, сидит хорошо', rating: 5 }]);
  ok(notneg.size.small === 0, 'R8 «не маломерит» не считается жалобой');
}
/* голое приветствие — не поиск */
{
  ok(STY.greetingOnly('привет') && STY.greetingOnly('Привет!') && STY.greetingOnly('здравствуйте'), 'G1 приветствия');
  ok(!STY.greetingOnly('привет, подбери куртку') && !STY.greetingOnly('куртка') && !STY.greetingOnly(''), 'G2 с предметной частью — не приветствие');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
