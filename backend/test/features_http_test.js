'use strict';
/* Интеграционный тест: поднимаем настоящий http-сервер с хуками features и ходим в него по сети (без базы и AI).
   Запуск: node backend/test/features_http_test.js */
process.chdir(__dirname + '/..');
const http = require('http');
const F = require('../lib/features');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('ok   ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + x : '')); } };
const U = { wardrobe: ['top:Чёрная футболка:black', 'top:Белая рубашка:white', 'top:Куртка оливковая:olive', 'bottom:Чёрные брюки:black', 'bottom:Синие джинсы:blue', 'shoes:Белые кроссовки:white', 'shoes:Чёрные ботинки:black'].map((x, i) => { const [cat, title, c] = x.split(':'); return { id: 'w' + i, cat, title, colors: [c], styles: ['minimal'] }; }), profile: { budget: 5000, topSize: 'M', pantsSize: '32', shoeSize: '43', colors: [] } };
const server = http.createServer((req, res) => {
  if (F.handlePublic(req, res)) return;
  if (F.handle(req, res, 'u1', U)) return;
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"orig":true}');
});
server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* не json */ } j._s = r.status; j._t = t; return j; };
  let r = await call('POST', '/api/features/capsule', { candidates: [] }); ok(r.ok && r.total > 0, 'H1 capsule по HTTP', JSON.stringify(r).slice(0, 120));
  r = await call('POST', '/api/features/calendar', { days: 3 }); ok(r.ok && r.days.length === 3 && r.forecast === false && /Прогноз недоступен/.test(r.note), 'H2 календарь без координат честно сообщает про прогноз');
  r = await call('POST', '/api/features/wardrobe-outfit', {}); ok(r.ok && r.outfits.length > 0, 'H3 образ из гардероба');
  r = await call('POST', '/api/features/compare', { a: { id: 'a', price: 1000, cat: 'top' }, b: { id: 'b', price: 2000, cat: 'top' } }); ok(r.ok && r.winner === 'a', 'H4 compare');
  r = await call('POST', '/api/features/compare', { a: { id: 'a' } }); ok(r._s === 400, 'H5 compare без второй вещи — 400');
  r = await call('POST', '/api/features/size', { product: { id: 'x', cat: 'top', sizes: ['M'] } }); ok(r.ok && r.recommended === 'M', 'H6 size');
  r = await call('POST', '/api/features/price/watch', { product: { id: 'wb5', title: 'T', price: 1000 } }); ok(r.ok && r.watching, 'H7 слежение вкл');
  r = await call('POST', '/api/features/price/report', { items: [{ id: 'wb5', price: 800 }] }); ok(r.ok && r.notes.length === 1, 'H8 отчёт о цене → уведомление');
  r = await call('GET', '/api/features/notes'); ok(r.ok && r.notes.length === 1 && !r.notes[0].read, 'H9 список уведомлений');
  r = await call('POST', '/api/features/notes/read'); r = await call('GET', '/api/features/state'); ok(r.ok && r.unread === 0 && r.watching.includes('wb5'), 'H10 state: прочитано, слежу за wb5');
  r = await call('POST', '/api/features/ai-feedback', { messageId: 'm1', value: -1, reason: 'Дорого' }); ok(r.ok && r.down === 1, 'H11 ai-feedback');
  r = await call('POST', '/api/features/replace', { items: [{ id: 'a', cat: 'top', colors: ['black'], price: 1 }], index: 0, pool: [] }); ok(r.ok && r.candidates.some((c) => c.item.own), 'H12 replace отдаёт свои вещи, если ленты нет');
  r = await call('POST', '/api/features/outfits/log', { kind: 'worn', name: 'N', items: [{ id: 'w0', title: 't', cat: 'top', own: true }] }); r = await call('GET', '/api/features/outfits/log'); ok(r.ok && r.log.length === 1, 'H13 журнал');
  r = await call('GET', '/api/features/nope'); ok(r._s === 404, 'H14 неизвестный маршрут — 404');
  r = await call('POST', '/api/features/capsule', null); ok(r.ok, 'H15 пустое тело допустимо');
  r = await call('POST', '/api/features/hints/dismiss', { key: 'k' }); ok(r.ok, 'H16 hints/dismiss');
  r = await call('GET', '/api/something'); ok(r.orig === true, 'H17 чужие маршруты доходят до оригинала');
  for (const f of ['/manifest.webmanifest', '/pwa-sw.js', '/features.js', '/icon-192.png']) { const x = await fetch(base + f); ok(x.status === 200 || x.status === 404, 'H18 статика ' + f + ' обрабатывается (' + x.status + ')'); }
  r = await call('GET', '/api/features/admin/usage'); ok(r._s === 403, 'H19 админ-метрика закрыта без ключа');
  const big = await fetch(base + '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'x'.repeat(3e6) }) }); ok(big.status === 413, 'H20 фото 3 МБ отсекается 413');
  server.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
});
