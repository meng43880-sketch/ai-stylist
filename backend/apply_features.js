'use strict';
/* Запуск из КОРНЯ проекта (где index.html и папка backend):   node backend/apply_features.js   или   node apply_features.js
   Вносит в backend/server.js три правки (подключение модуля и два хука). Делает server.js.bak.
   Не нашёл место — ничего не пишет и говорит, какое. Повторный запуск безопасен. */
const fs = require('fs');
const path = require('path');
const file = [path.join(process.cwd(), 'backend', 'server.js'), path.join(process.cwd(), 'server.js')].find((f) => fs.existsSync(f));
if (!file) { console.error('Не нашёл server.js — запусти из корня проекта.'); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const crlf = src.includes('\r\n'); if (crlf) src = src.replace(/\r\n/g, '\n');
const original = src;
const patches = [
  { name: 'подключение модуля features', done: "require('./lib/features')", from: "const EV = require('./lib/events');", to: "const EV = require('./lib/events');\nconst FEAT = require('./lib/features'); // умные функции: капсула, календарь, цены, квоты, PWA" },
  { name: 'хук до проверки авторизации (PWA-файлы, мониторинг, защита от больших фото)', done: 'FEAT.handlePublic(', from: 'const isPublic = ', to: 'if (FEAT.handlePublic(req, res)) return;\n  const isPublic = ' },
  { name: 'хук после авторизации (API умных функций, лимиты)', done: 'FEAT.handle(', from: 'const U = uid ? UD(uid) : null;', to: 'const U = uid ? UD(uid) : null;\n  if (FEAT.handle(req, res, uid, U)) return;' }
];
let applied = 0, skipped = 0; const failed = [];
for (const p of patches) {
  if (src.includes(p.done)) { skipped++; console.log('уже есть:  ' + p.name); continue; }
  const n = src.split(p.from).length - 1;
  if (n !== 1) { failed.push(p.name + ' (найдено мест: ' + n + ')'); continue; }
  src = src.replace(p.from, () => p.to); applied++; console.log('внесено:   ' + p.name);
}
if (failed.length) { console.error('\nНЕ ПРИМЕНЕНО, файл не изменён. Не нашёл место для:\n - ' + failed.join('\n - ') + '\nПришли server.js — подгоню.'); process.exit(2); }
/* Необязательная правка: настоящий IP за прокси Render (иначе лимит запросов один на всех). */
if (!src.includes('x-forwarded-for') && src.includes('req.socket.remoteAddress')) {
  src = src.split('req.socket.remoteAddress').join("((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress)");
  applied++; console.log('внесено:   реальный IP за прокси (x-forwarded-for)');
}
if (src !== original) { fs.writeFileSync(file + '.bak2', crlf ? original.replace(/\n/g, '\r\n') : original); fs.writeFileSync(file, crlf ? src.replace(/\n/g, '\r\n') : src); }
console.log(`\nГотово: внесено ${applied}, уже было ${skipped}.` + (applied ? ' Копия: ' + path.basename(file) + '.bak2' : ''));
