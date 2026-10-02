'use strict';
/* collector/collect.js — домашний сборщик каталога для sainvio (MVP-мост).
   Запуск ТОЛЬКО на домашнем ПК (жилой IP проходит у WB, дата-центры — нет):
     node collector/collect.js
   Что делает: идёт по списку запросов (одежда/обувь), тянет search.wb.ru
   напрямую (1 страница × 30, пауза 2.5с — вежливо, без долбёжки), нормализует
   тем же normalizeWbItem, что и backend, и пушит итог на сервер
   POST {COLLECTOR_BACKEND}/api/collector/push с секретом COLLECTOR_KEY.
   Настройки — только из backend/.env (в git не идёт):
     COLLECTOR_KEY=...        # тот же, что на сервере
     COLLECTOR_BACKEND=https://xxx.onrender.com  # куда пушить
   Расписание: Планировщик Windows → каждые 6 часов. ПК должен быть включён —
   пока скрипт не отработал, сервер раздаёт прошлый пуш (до 24ч), потом тихо
   пустеет. Рубильник на сервере: COLLECTOR_ENABLED=true/false.
   Честно про серость: системный сбор чужого каталога нарушает правила WB.
   Паузы и скромный объём снижают риск бана IP, но не убирают его. */
const fs = require('fs');
const path = require('path');
const { normalizeWbItem } = require('../backend/lib/market');

const ROOT = path.join(__dirname, '..');
const DOTENV = path.join(ROOT, 'backend', '.env');
function loadEnv() {
  const out = {};
  try {
    fs.readFileSync(DOTENV, 'utf8').split('\n').forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf('=');
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    });
  } catch {}
  return out;
}
/* МВП-набор: ходовые одежные запросы. Хватит для проверки моста. */
const QUERIES = [
  'футболка', 'худи', 'джинсы', 'кроссовки', 'куртка', 'рубашка',
  'брюки', 'свитшот', 'кеды', 'пальто', 'джемпер', 'чиносы',
  'бомбер', 'лонгслив', 'карго', 'ботинки', 'кепка', 'рюкзак',
  'платье', 'юбка', 'ветровка', 'пуховик', 'толстовка', 'кроссовки белые',
  'шапка', 'шарф', 'перчатки', 'носки', 'ремень', 'очки'
];
const PER_QUERY = 30;
const PAUSE_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function wbSearch(query) {
  const q = encodeURIComponent(query);
  const url = `https://search.wb.ru/exactmatch/ru/common/v18/search?ab_testing=false&appType=1&curr=rub&dest=-1257786&page=1&query=${q}&resultset=catalog&sort=popular&spp=${PER_QUERY}&suppressSpellcheck=false`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'ru-RU,ru;q=0.9' } });
    if (r.status === 403 || r.status === 429) { const e = new Error('WB reject ' + r.status); e.code = 'REJECT'; throw e; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j && j.data && j.data.products) || [];
  } finally { clearTimeout(t); }
}

(async () => {
  const env = loadEnv();
  const key = env.COLLECTOR_KEY || '';
  const backend = (env.COLLECTOR_BACKEND || 'http://127.0.0.1:8001').replace(/\/$/, '');
  if (!key) { console.error('Нет COLLECTOR_KEY в backend/.env'); process.exit(1); }
  const seen = new Set(), out = [];
  let ok = 0, fail = 0;
  for (const qq of QUERIES) {
    try {
      const raw = await wbSearch(qq);
      raw.map(normalizeWbItem).filter(Boolean).forEach((p) => {
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      });
      ok++;
      console.log(`+ ${qq}: ${raw.length} raw, всего ${out.length}`);
    } catch (e) {
      fail++;
      console.error(`- ${qq}: ${e.code || e.message}`);
      if (e.code === 'REJECT') { console.error('WB режет IP — стоп, попробуй позже'); break; }
    }
    await sleep(PAUSE_MS);
  }
  if (!out.length) { console.error('Пусто — пушить нечего'); process.exit(2); }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(backend + '/api/collector/push', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-collector-key': key },
      body: JSON.stringify({ items: out.slice(0, 1500) })
    });
    const j = await r.json().catch(() => ({}));
    console.log(`push -> HTTP ${r.status}`, JSON.stringify(j).slice(0, 200));
    if (!r.ok) process.exit(3);
    console.log(`Готово: запросов ok=${ok} fail=${fail}, товаров ${out.length}`);
  } finally { clearTimeout(t); }
})().catch((e) => { console.error('FATAL', e.message); process.exit(9); });
