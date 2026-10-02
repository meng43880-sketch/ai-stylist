'use strict';
/* sw.js — сборщик WB внутри живого браузера (MV3 service worker).
   Запросы к search.wb.ru идут с куками/отпечатком настоящего Chrome,
   поэтому wbaas их пропускает, а node-скрипты с того же IP — нет.
   Пуш — на POST {backend}/api/collector/push с секретом (CORS открыт
   только для /api/collector/*). Пауза 2.5с между запросами. */
const QUERIES = [
  'футболка', 'худи', 'джинсы', 'кроссовки', 'куртка', 'рубашка',
  'брюки', 'свитшот', 'кеды', 'пальто', 'джемпер', 'чиносы',
  'бомбер', 'лонгслив', 'карго', 'ботинки', 'кепка', 'рюкзак',
  'платье', 'юбка', 'ветровка', 'пуховик', 'толстовка', 'кроссовки белые',
  'шапка', 'шарф', 'перчатки', 'носки', 'ремень', 'очки'
];
const PER_QUERY = 30;
const PAUSE_MS = 2500;
const BASKET = [[143, '01'], [287, '02'], [431, '03'], [575, '04'], [719, '05'], [863, '06'], [1007, '07'], [1151, '08'], [1295, '09'], [1439, '10'], [1583, '11'], [1727, '12'], [1871, '13'], [2015, '14'], [2159, '15'], [2303, '16'], [2447, '17'], [2591, '18'], [2735, '19'], [2879, '20'], [3023, '21'], [3167, '22'], [3311, '23'], [3455, '24'], [3599, '25'], [3743, '26'], [3887, '27'], [4031, '28'], [4175, '29'], [4319, '30'], [4463, '31'], [4607, '32'], [4751, '33']];
function basketHost(vol) { for (const [m, h] of BASKET) if (vol <= m) return h; return '33'; }
function wbPhoto(id) {
  const vol = Math.floor(id / 100000), part = Math.floor(id / 1000);
  return `https://basket-${basketHost(vol)}.wb.ru/vol${vol}/part${part}/${id}/photos/big/1.webp`;
}
const CATS = [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['свитер', 'top'], ['джемпер', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['юбк', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['туфл', 'shoes'], ['рюкзак', 'acc'], ['сумк', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc'], ['шапк', 'acc'], ['ремен', 'acc']];
function wbCat(name) {
  const s = String(name || '').toLowerCase();
  for (const [k, v] of CATS) if (s.includes(k)) return v;
  return 'top';
}
function norm(raw) {
  const id = raw.id || raw.nmId;
  if (!id) return null;
  const price = Math.round((raw.salePriceU != null ? raw.salePriceU : raw.salePrice) / 100) || 0;
  if (!price) return null;
  const old = Math.round((raw.priceU != null ? raw.priceU : raw.price) / 100) || price;
  return {
    id: 'wb' + id, nmId: id, title: String(raw.name || 'Товар').slice(0, 120),
    price, old: old > price ? old : Math.round(price * 1.2),
    img: wbPhoto(id), mp: 'WB', brand: String(raw.brand || '').slice(0, 40),
    cat: wbCat(raw.name), colors: [], sizes: ['One'], styles: [], fit: 'regular',
    rating: Number(raw.reviewRating || raw.rating) || 0, reviews: Number(raw.feedbacks || 0),
    live: true, source: 'homefeed', url: `https://www.wildberries.ru/catalog/${id}/detail.aspx`,
    fetchedAt: Date.now(), desc: ''
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function log(msg) {
  const o = await chrome.storage.local.get('log');
  const arr = (o.log || []).concat([new Date().toLocaleTimeString() + ' ' + msg]).slice(-30);
  await chrome.storage.local.set({ log: arr });
}
async function runCollect() {
  const cfg = await chrome.storage.local.get(['backend', 'key']);
  const backend = (cfg.backend || '').replace(/\/$/, '');
  const key = cfg.key || '';
  if (!backend || !key) { await log('Нет backend/key — впиши в попапе'); return; }
  await chrome.storage.local.set({ running: true });
  await log('Старт: ' + QUERIES.length + ' запросов');
  const seen = new Set(), out = [];
  let fails = 0;
  for (const qq of QUERIES) {
    try {
      const url = 'https://search.wb.ru/exactmatch/ru/common/v18/search?ab_testing=false&appType=1&curr=rub&dest=-1257786&page=1&query='
        + encodeURIComponent(qq) + '&resultset=catalog&sort=popular&spp=' + PER_QUERY + '&suppressSpellcheck=false';
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const list = (j && j.data && j.data.products) || [];
      list.map(norm).filter(Boolean).forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } });
      fails = 0;
      await log('+ ' + qq + ': ' + list.length + ' (всего ' + out.length + ')');
    } catch (e) {
      fails++;
      await log('- ' + qq + ': ' + e.message);
      if (fails >= 3 && !out.length) { await log('Три провала подряд — стоп'); break; }
    }
    await sleep(PAUSE_MS);
  }
  if (!out.length) { await chrome.storage.local.set({ running: false }); return; }
  try {
    const r = await fetch(backend + '/api/collector/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-collector-key': key },
      body: JSON.stringify({ items: out.slice(0, 1500) })
    });
    await log('push -> HTTP ' + r.status + ', товаров ' + out.length);
  } catch (e) {
    await log('push ERR ' + e.message);
  }
  await chrome.storage.local.set({ running: false, lastRun: Date.now(), lastCount: out.length });
}
chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'collect') runCollect(); });
chrome.alarms.onAlarm.addListener((a) => { if (a && a.name === 'hf') runCollect(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('hf', { periodInMinutes: 360 }); });
