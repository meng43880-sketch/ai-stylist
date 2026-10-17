'use strict';
/* Офлайн-тесты умных функций (без сети, без AI, без базы). Запуск: node backend/test/features_test.js */
process.chdir(__dirname + '/..');
const F = require('../lib/features');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('ok   ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + x : '')); } };
const w = (id, title, cat, colors, styles) => ({ id, title, cat, colors, styles: styles || ['minimal'] });
const WARD = [
  w('w1', 'Чёрная футболка', 'top', ['black']), w('w2', 'Белая рубашка', 'top', ['white']), w('w3', 'Серый свитшот', 'top', ['gray']),
  w('w4', 'Оливковая куртка', 'top', ['olive']), w('w5', 'Чёрные брюки', 'bottom', ['black']), w('w6', 'Синие джинсы', 'bottom', ['blue']),
  w('w7', 'Бежевые чиносы', 'bottom', ['beige']), w('w8', 'Белые кроссовки', 'shoes', ['white']), w('w9', 'Чёрные ботинки', 'shoes', ['black']),
  w('w10', 'Серая кепка', 'acc', ['gray'])
];
const user = (wardrobe) => ({ wardrobe: wardrobe || WARD.map((x) => Object.assign({}, x)), profile: { budget: 5000, colors: ['black'], styles: ['minimal'], topSize: 'M', pantsSize: '32', shoeSize: '43' } });
const prof = { budget: 5000, topSize: 'M', pantsSize: '32', shoeSize: '43' };

/* капсула */
{
  const r = F.capsule(user(), prof, null, []);
  ok(r.ok && r.total > 10 && r.outfits.length <= 30, 'C1 капсула из 10 вещей даёт много образов', r.total + '');
  ok(r.outfits.every((o) => o.ids.length >= 3), 'C2 в каждом образе ≥3 вещи');
  ok(r.message.includes('10'), 'C3 сообщение называет число вещей');
  const bad = F.capsule(user([w('a', 'Футболка', 'top', ['black'])]), prof, null, []);
  ok(!bad.ok && bad.missing.includes('shoes') && bad.missing.includes('bottom'), 'C4 без низа и обуви — честный отказ');
  const cand = { id: 'p1', title: 'Серые кроссовки', cat: 'shoes', colors: ['gray'], price: 3000, aiScore: 80, styles: ['minimal'] };
  const g = F.capsule(user(), prof, null, [cand, { id: 'p2', title: 'Часы', cat: 'acc', colors: ['black'], price: 100 }]);
  ok(g.gains.length === 1 && g.gains[0].id === 'p1' && g.gains[0].newOutfits > 0, 'C5 «что докупить» считает прирост и игнорирует аксессуары');
}
/* погода */
{
  const own = F.wardrobeOwn(user());
  const cold = F.combos(own, { temp: 3 });
  ok(cold.length && cold.slice(0, 5).every((c) => c.items.some(F.isOuter)), 'W1 при +3 в лучших образах есть верхняя одежда');
  const hot = F.combos(own, { temp: 26 });
  ok(hot.slice(0, 5).every((c) => !c.items.some(F.isOuter)), 'W2 при +26 куртку не предлагаем');
  ok(F.weatherAdjust(70, [{ cat: 'top', title: 'футболка' }], 3) < 70, 'W3 без куртки в холод — штраф');
}
/* календарь */
{
  const days = Array.from({ length: 7 }, (_, i) => ({ date: '2026-10-1' + i, temp: 10, rain: false }));
  const r = F.calendar(user(), prof, days);
  ok(r.ok && r.days.length === 7 && r.days.every((d) => d.outfit), 'K1 на 7 дней 7 образов');
  const keys = r.days.map((d) => d.outfit.ids.slice().sort().join('+'));
  ok(keys.every((k, i) => i === 0 || k !== keys[i - 1]), 'K2 одинаковые образы подряд не стоят');
  ok(new Set(keys).size >= 5, 'K3 образы разнообразны', new Set(keys).size + '');
  const U = user(); const first = r.days[0].outfit.ids;
  F.logOutfit(U, { kind: 'worn', name: 'x', items: first.map((id) => ({ id, title: id, cat: 'top' })), date: '2026-10-10' });
  const r2 = F.calendar(U, prof, days);
  ok(r2.days.every((d) => d.outfit.ids.slice().sort().join('+') !== first.slice().sort().join('+')), 'K4 надетый на днях образ не повторяется');
  ok(!F.calendar(user([]), prof, days).ok, 'K5 пустой гардероб — не ок');
}
/* образ из гардероба */
{
  const r = F.wardrobeOutfit(user(), prof, 12, { count: 3 });
  ok(r.ok && r.outfits.length >= 2 && r.outfits.every((o) => o.total === 0 && o.items.every((i) => i.own)), 'G1 образы только из своих вещей, цена 0');
  ok(/ничего покупать не нужно/.test(r.message), 'G2 сообщение честное');
  const m = F.wardrobeOutfit(user(WARD.filter((x) => x.cat !== 'shoes')), prof, 12);
  ok(!m.ok && /обуви/.test(m.message), 'G3 нет обуви — говорим что добавить');
}
/* замена вещи */
{
  const items = [{ id: 'a', cat: 'top', colors: ['black'], price: 2000, aiScore: 80, styles: ['minimal'] }, { id: 'b', cat: 'bottom', colors: ['black'], price: 2500, aiScore: 80, styles: ['minimal'] }, { id: 'c', cat: 'shoes', colors: ['white'], price: 3000, aiScore: 80, styles: ['minimal'] }];
  const pool = [{ id: 'x1', cat: 'top', colors: ['olive'], price: 1800, aiScore: 85, styles: ['minimal'] }, { id: 'x2', cat: 'top', colors: ['red'], price: 1800, aiScore: 85, styles: ['street'] }, { id: 'a', cat: 'top', colors: ['black'] }, { id: 'y', cat: 'shoes', colors: ['black'], price: 1 }];
  const r = F.replaceItem(user([]), prof, items, 0, pool, 12);
  ok(r.candidates.length === 2 && r.candidates.every((c) => c.item.cat === 'top' && c.item.id !== 'a'), 'R1 замены — только та же категория, без текущей');
  ok(r.candidates[0].score >= r.candidates[1].score, 'R2 лучшая замена первой');
  const U = user([]); U.feedback = { dislikes: { x1: true } };
  ok(F.replaceItem(U, prof, items, 0, pool, 12).candidates.every((c) => c.item.id !== 'x1'), 'R3 дизлайкнутое не предлагаем');
  const withOwn = F.replaceItem(user(), prof, items, 0, [], 12);
  ok(withOwn.candidates.some((c) => c.item.own), 'R4 свои вещи тоже кандидаты');
  let thrown = false; try { F.replaceItem(user([]), prof, items, 9, pool, 12); } catch (e) { thrown = e.status === 400; }
  ok(thrown, 'R5 неверный индекс — 400');
}
/* сравнение */
{
  const a = { id: 'a', price: 2000, rating: 4.8, reviews: 500, aiScore: 85, cat: 'top', colors: ['black'] }, b = { id: 'b', price: 3500, rating: 4.2, reviews: 40, aiScore: 70, cat: 'top', colors: ['black'] };
  const r = F.compare(user(), prof, a, b, null, null);
  ok(r.winner === 'a' && /A/.test(r.verdict), 'P1 дешевле и лучше — побеждает A');
  ok(r.rows.find((x) => x.label === 'Цена').win === 'a', 'P2 по цене A');
  const eq = F.compare(user([]), prof, { id: 'a', price: 1000, cat: 'top' }, { id: 'b', price: 1010, cat: 'top' }, null, null);
  ok(eq.winner === null, 'P3 почти равны — ничья');
  const RV = require('../lib/reviews');
  const small = RV.analyze(Array.from({ length: 6 }, () => ({ text: 'Маломерит, брала свой размер, мала', rating: 3 })));
  const okst = RV.analyze(Array.from({ length: 6 }, () => ({ text: 'Села идеально, в размер, подошла', rating: 5 })));
  const c = F.compare(user([]), prof, { id: 'a', price: 1000, cat: 'top' }, { id: 'b', price: 1000, cat: 'top' }, small, okst);
  ok(c.rows.find((x) => x.label === 'Посадка').win === 'b', 'P4 «в размер» лучше «маломерит»');
}
/* размер */
{
  const RV = require('../lib/reviews');
  const mk = (t, n, r) => RV.analyze(Array.from({ length: n }, () => ({ text: t, rating: r })));
  const small = F.sizeAdvice({ cat: 'top', sizes: ['S', 'M', 'L', 'XL'] }, mk('Маломерит, мала', 8, 3), prof, null);
  ok(small.recommended === 'L' && small.shift === 1 && small.inStock, 'Z1 маломерит: M → L');
  const big = F.sizeAdvice({ cat: 'top' }, mk('Большемерит, велика', 8, 3), prof, null);
  ok(big.recommended === 'S' && big.shift === -1, 'Z2 большемерит: M → S');
  const okk = F.sizeAdvice({ cat: 'top' }, mk('в размер, подошла', 8, 5), prof, null);
  ok(okk.recommended === 'M' && okk.shift === 0 && okk.confidence === 'high', 'Z3 в размер: M');
  const none = F.sizeAdvice({ cat: 'shoes' }, null, prof, null);
  ok(none.recommended === '43' && none.confidence === 'low', 'Z4 нет отзывов: свой размер, низкая уверенность');
  const shoesUp = F.sizeAdvice({ cat: 'shoes' }, mk('Маломерят, мала', 5, 3), prof, null);
  ok(shoesUp.recommended === '44', 'Z5 обувь: 43 → 44');
  ok(!F.sizeAdvice({ cat: 'top' }, null, {}, null).ok, 'Z6 нет размера в профиле — просим указать');
  ok(F.sizeAdvice({ cat: 'top' }, null, {}, { chest: 104 }).recommended === 'L', 'Z7 по обхвату груди 104 → L');
  const oos = F.sizeAdvice({ cat: 'top', sizes: ['S', 'M'] }, mk('Маломерит, мала', 8, 3), prof, null);
  ok(!oos.inStock && oos.alt === 'M', 'Z8 нужного размера нет в наличии → предупреждаем');
  ok(F.shiftSize('XL', 1) === 'XXL' && F.shiftSize('XS', -3) === 'XXS' && F.shiftSize('48', 1, 'top') === '50', 'Z9 сдвиг размеров');
}
/* палитра */
{
  const v = { summary: 'x', recommended_colors: ['серый', 'Бежевый', 'olive'], palette: 'тёмно-зелёный и чёрный', notes: 'белый фон' };
  const c = F.paletteFromVision(v);
  ok(c.includes('gray') && c.includes('beige') && c.includes('olive') && c.length <= 4, 'L1 цвета из vision (не больше 4)', c.join());
  ok(!c.includes('white'), 'L2 «белый фон» в нецветовом поле не считаем');
  const U = user(); U.profile.colors = ['black'];
  const r = F.paletteConfirm(U, ['gray', 'beige', 'pink'], ['olive']);
  ok(r.colors.join() === 'black,gray,beige', 'L3 принятые добавлены, неизвестные нет', r.colors.join());
  ok(U.ext.palette.rejected.includes('olive'), 'L4 отклонённые запомнены');
}

/* лимиты и учёт */
{
  const U = user(); process.env.LIMIT_CHAT_DAY = '3';
  const a = [F.checkQuota(U, 'chat', true), F.checkQuota(U, 'chat', true), F.checkQuota(U, 'chat', true), F.checkQuota(U, 'chat', true)];
  ok(a[0].ok && a[2].ok && !a[3].ok && /лимит/i.test(a[3].reason), 'Q1 четвёртый вопрос при лимите 3 — отказ');
  ok(a[2].left === 0, 'Q2 осталось 0 после третьего');
  U.ext.quota.day = '2000-01-01'; ok(F.checkQuota(U, 'chat', false).ok, 'Q3 новый день — лимит сброшен');
  F.account(U, 3200, 640); ok(U.ext.quota.inTok === 1000 && U.ext.quota.outTok === 200, 'Q4 токены считаются (≈3.2 символа)');
  F.account(U, 0, 0, true); ok(F.usageView(U).cacheHits === 1, 'Q5 попадания в кеш учитываются');
  process.env.LIMIT_TOKENS_DAY = '1000'; ok(!F.checkQuota(U, 'vision', false).ok, 'Q6 лимит токенов тоже работает'); delete process.env.LIMIT_TOKENS_DAY; delete process.env.LIMIT_CHAT_DAY;
}
/* цены */
{
  const U = user();
  F.watchSet(U, { id: 'wb100', title: 'Куртка', price: 5000, img: 'x' }, true, 0);
  ok(U.ext.watch.wb100.nmId === '100', 'T1 nmId берётся из id wb…');
  ok(F.priceReport(U, [{ id: 'wb100', price: 5000 }]).length === 0, 'T2 цена та же — тишина');
  const n = F.priceReport(U, [{ id: 'wb100', price: 4500 }]);
  ok(n.length === 1 && n[0].to === 4500 && U.ext.notes.length === 1, 'T3 подешевело на 10% — уведомление');
  ok(F.priceReport(U, [{ id: 'wb100', price: 4500 }]).length === 0, 'T4 повторно то же — без дубля');
  ok(F.priceReport(U, [{ id: 'wb100', price: 4400 }]).length === 0, 'T5 падение <3% — не шумим');
  F.watchSet(U, { id: 'wb200', title: 'Кроссовки', price: 3000 }, true, 2500);
  ok(F.priceReport(U, [{ id: 'wb200', price: 2490 }]).length === 1, 'T6 достигнута целевая цена — сообщаем');
  ok(F.priceReport(U, [{ id: 'nope', price: 1 }]).length === 0, 'T7 неотслеживаемое игнорируем');
  F.watchSet(U, { id: 'wb100' }, false); ok(!U.ext.watch.wb100, 'T8 снятие слежения');
  let lim = false; const V = user(); try { for (let i = 0; i < 51; i++) F.watchSet(V, { id: 'wb' + i, price: 1 }, true); } catch (e) { lim = true; }
  ok(lim, 'T9 больше 50 вещей нельзя');
  ok(F.parseWbPrice({ salePriceU: 123400 }) === 1234 && F.parseWbPrice({ sizes: [{ price: { product: 99900 } }, { price: { product: 89900 } }] }) === 899 && F.parseWbPrice({}) === 0, 'T10 разбор цены WB (оба формата)');
}
/* журнал, повторы */
{
  const U = user();
  const items = [{ id: 'w1', title: 'a', cat: 'top' }, { id: 'w5', title: 'b', cat: 'bottom' }];
  F.logOutfit(U, { kind: 'worn', name: 'N', items, date: '2026-10-10' }); F.logOutfit(U, { kind: 'worn', name: 'N', items, date: '2026-10-10' });
  ok(U.ext.outfitLog.length === 1, 'J1 одна дата — одна запись');
  const outs = [{ id: 'auto0', items: ['w1', 'w5'] }, { id: 'auto1', items: ['w2', 'w5'] }];
  ok(F.avoidWorn(outs, U, 10).length === 1 && F.avoidWorn(outs, U, 10)[0].id === 'auto1', 'J2 надетый один в один убирается');
  ok(F.avoidWorn([outs[0]], U, 10).length === 1, 'J3 если больше нечего — не оставляем пусто');
  let t = false; try { F.logOutfit(U, { items: [] }); } catch (e) { t = e.status === 400; } ok(t, 'J4 пустой образ — 400');
}
/* подсказки */
{
  const U = user([w('a', 'Футболка', 'top', ['black']), w('b', 'Брюки', 'bottom', ['black']), w('c', 'Кроссовки', 'shoes', ['white'])]);
  const h = F.hints(U, prof, 3);
  ok(h.length && h[0].key === 'cold-no-outer' && /\+3|3°/.test(h[0].text), 'H1 холодно и нет куртки — подсказка');
  F.hintAccept(U, 'cold-no-outer', null);
  ok(!F.hints(U, prof, 3).some((x) => x.key === 'cold-no-outer'), 'H2 закрытая подсказка не возвращается 3 дня');
  ok(F.hints(user([w('a', 'Куртка', 'top', ['olive'])]), prof, 3).every((x) => x.key !== 'cold-no-outer'), 'H3 куртка есть — молчим');
  ok(F.hints(user([]), prof, 15).some((x) => x.key === 'empty-wardrobe'), 'H4 пустой гардероб — зовём добавить вещи');
  const V = user([]); F.priceReport(V, []); V.ext.notes.push({ type: 'price', read: false, text: 'x' });
  ok(F.hints(V, prof, null).some((x) => x.key === 'price-drop'), 'H5 подешевело — подсказка');
  const S = user(); const r = F.hintAccept(S, 'style-street', { type: 'style', value: 'street' });
  ok(S.profile.styles.includes('street'), 'H6 принятый стиль попал в профиль');
}
/* память диалога */
(async () => {
  const U = user(); const chats = [];
  for (let i = 0; i < 5; i++) { chats.push({ role: 'user', text: 'куртка до 7000 ' + i }); chats.push({ role: 'ai', text: 'ответ ' + i }); await F.afterChat(U, 'c1', chats, { category: 'top', maxPrice: 7000, occasion: 'autumn' }); if (i < 4) ok(F.memoryFor(U, 'c1') === '', 'M' + (i + 1) + ' резюме ещё нет (' + (i + 1) * 2 + ' сообщ.)'); }
  const m = F.memoryFor(U, 'c1');
  ok(m.length > 20 && m.length <= 300 && /до 7000/.test(m), 'M5 на 10-м сообщении резюме ≤300 символов с бюджетом', m);
  ok(F.memoryFor(U, 'zzz') === '' && F.memoryFor(null, 'c1') === '', 'M6 чужой/пустой диалог — пусто');
  /* обратная связь */
  const fb = F.aiFeedback(U, { messageId: 'm1', cid: 'c1', value: 1 }); F.aiFeedback(U, { messageId: 'm2', value: -1, reason: 'Дорого' }); const fb3 = F.aiFeedback(U, { messageId: 'm1', value: -1 });
  ok(fb.up === 1 && fb3.up === 0 && fb3.down === 2, 'B1 повторная оценка того же сообщения заменяет прежнюю', JSON.stringify(fb3));
  /* HTTP-хуки */
  const mkRes = () => { const r = { code: 0, body: '', headers: {}, writeHead(c, h) { r.code = c; r.headers = h || {}; }, end(b) { r.body = b || ''; }, on(ev, f) { r['_' + ev] = f; } }; return r; };
  const mkReq = (method, url, headers) => ({ method, url, headers: headers || {}, resume() {} });
  let res = mkRes(); ok(F.handlePublic(mkReq('POST', '/api/ai/chat', { 'content-length': String(5e6) }), res) === true && res.code === 413, 'X1 огромный запрос с фото — 413 до разбора');
  res = mkRes(); ok(F.handlePublic(mkReq('POST', '/api/ai/chat', { 'content-length': '500' }), res) === false, 'X2 обычный запрос идёт дальше');
  res = mkRes(); const cr = mkReq('POST', '/api/collector/reviews'); ok(F.handlePublic(cr, res) === false && typeof res._finish === 'function', 'X3 push расширения отслеживается');
  res.statusCode = 200; res._finish(); ok(F.health().extension.status === 'fresh' && F.health().extension.ageMin === 0, 'X4 после успешного push статус fresh');
  res = mkRes(); F.handlePublic(mkReq('GET', '/api/features/health'), res); ok(res.code === 200 && JSON.parse(res.body).extension.status === 'fresh', 'X5 /api/features/health отвечает');
  process.env.LIMIT_CHAT_DAY = '1'; const L = user(); F.checkQuota(L, 'chat', true);
  res = mkRes(); ok(F.handle(mkReq('POST', '/api/ai/chat'), res, 'u1', L) === true, 'X6 лимит исчерпан — запрос перехвачен');
  const body = JSON.parse(res.body); ok(res.code === 200 && body.ok && body.data.limited && /лимит/i.test(body.data.message) && body.data.picks.length === 0, 'X7 клиент получает дружелюбный ответ, а не ошибку');
  process.env.LIMIT_VISION_DAY = '1'; const Vp = user(); res = mkRes(); ok(F.handle(mkReq('POST', '/api/analyze-photo'), res, 'u1', Vp) === false, 'X8 первый анализ фото проходит'); res = mkRes(); ok(F.handle(mkReq('POST', '/api/analyze-photo'), res, 'u1', Vp) === true && res.code === 429, 'X8b второй — 429 при лимите 1'); delete process.env.LIMIT_VISION_DAY; delete process.env.LIMIT_CHAT_DAY;
  const D = user(); D.ext = { watch: { a: 1 } }; res = mkRes(); F.handle(mkReq('DELETE', '/api/profile'), res, 'u1', D); ok(D.ext === undefined, 'X9 «Удалить мои данные» стирает U.ext');
  res = mkRes(); ok(F.handle(mkReq('GET', '/api/profile'), res, 'u1', user()) === false, 'X10 чужие маршруты не трогаем');
  ok(F.handle(mkReq('GET', '/api/features/hints'), mkRes(), null, null) === false, 'X11 без пользователя хук молчит');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
