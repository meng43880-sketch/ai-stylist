'use strict';
/* sw.js — сборщик WB внутри живого браузера (MV3 service worker).
   Запросы к search.wb.ru идут с куками/отпечатком настоящего Chrome,
   поэтому wbaas их пропускает, а node-скрипты с того же IP — нет.
   Пуш — на POST {backend}/api/collector/push с секретом (CORS открыт
   только для /api/collector/*). Пауза 2.5с между запросами. */
/* Режим человека: наборы ротируются по дням — каждый прогон приносит
   новые категории, газета копится всю неделю (потолок 5000, чистка старья).
   8 запросов × ~30 карточек ≈ 150-200 за ~1.5 мин. */
const QUERY_SETS = [
  ['футболка', 'худи', 'джинсы', 'кроссовки', 'куртка', 'платье', 'рубашка', 'брюки'],
  ['шапка', 'шарф', 'перчатки', 'носки', 'ремень', 'очки', 'кепка', 'рюкзак'],
  ['пальто', 'ветровка', 'пуховик', 'толстовка', 'юбка', 'свитшот', 'кеды', 'чиносы']
];
/* Набор на прогон: ручной выбор из попапа (для второго профиля Chrome —
   storage.local у профилей раздельное) либо авто по дню. */
async function pickQueries() {
  try {
    const o = await chrome.storage.local.get('set');
    if (o.set !== undefined && o.set !== 'auto' && QUERY_SETS[+o.set]) return QUERY_SETS[+o.set];
  } catch (e) {}
  return QUERY_SETS[Math.floor(Date.now() / 86400000) % QUERY_SETS.length];
}
const PER_QUERY = 30;
const PAUSE_MS = 2500;
const BASKET = [[143, '01'], [287, '02'], [431, '03'], [575, '04'], [719, '05'], [863, '06'], [1007, '07'], [1151, '08'], [1295, '09'], [1439, '10'], [1583, '11'], [1727, '12'], [1871, '13'], [2015, '14'], [2159, '15'], [2303, '16'], [2447, '17'], [2591, '18'], [2735, '19'], [2879, '20'], [3023, '21'], [3167, '22'], [3311, '23'], [3455, '24'], [3599, '25'], [3743, '26'], [3887, '27'], [4031, '28'], [4175, '29'], [4319, '30'], [4463, '31'], [4607, '32'], [4751, '33']];
function basketHost(vol) { for (const [m, h] of BASKET) if (vol <= m) return h; return '33'; }
function wbPhoto(id) {
  const vol = Math.floor(id / 100000), part = Math.floor(id / 1000);
  return `https://basket-${basketHost(vol)}.wbbasket.ru/vol${vol}/part${part}/${id}/images/big/1.webp`;
}
const CATS = [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['свитер', 'top'], ['джемпер', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['юбк', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['туфл', 'shoes'], ['рюкзак', 'acc'], ['сумк', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc'], ['шапк', 'acc'], ['ремен', 'acc']];
function wbCat(name) {
  const s = String(name || '').toLowerCase();
  for (const [k, v] of CATS) if (s.includes(k)) return v;
  return 'top';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function log(msg) {
  const o = await chrome.storage.local.get('log');
  const arr = (o.log || []).concat([new Date().toLocaleTimeString() + ' ' + msg]).slice(-30);
  await chrome.storage.local.set({ log: arr });
}
/* Вкладка WB для запросов: ищем открытую, иначе открываем фоновую сами.
   Ждём готовности content.js (пинг до 12с), в конце свою вкладку закрываем. */
async function ping(tabId, tries) {
  for (let i = 0; i < tries; i++) {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { type: 'wbPing' });
      if (pong && pong.ok) return true;
    } catch (e) { /* ещё грузится */ }
    await sleep(1000);
  }
  return false;
}
async function wbTabSend(type, url, query, fast) {
  /* Старые вкладки (открыты до обновления расширения) скрипта не имеют —
     их не ждём дольше 3с, а открываем свежую. */
  const tabs = await chrome.tabs.query({ url: 'https://www.wildberries.ru/*' });
  let tab = null, mine = false;
  for (const t of tabs) {
    if (await ping(t.id, 3)) { tab = t; break; }
  }
  if (!tab) {
    tab = await chrome.tabs.create({ url: 'https://www.wildberries.ru/', active: false });
    mine = true;
    if (!await ping(tab.id, 8)) {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
      throw new Error('Вкладка WB не отвечает — обнови страницу WB (F5) и повтори');
    }
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type, url, query, fast: !!fast });
    return { res, mine, tabId: tab.id };
  } catch (e) {
    if (mine) { try { await chrome.tabs.remove(tab.id); } catch (ee) {} }
    throw new Error('Вкладка WB не отвечает — открой wildberries.ru вручную');
  }
}
async function runCollect() {
  const cfg = await chrome.storage.local.get(['backend', 'key']);
  const backend = (cfg.backend || '').replace(/\/$/, '');
  const key = cfg.key || '';
  if (!backend || !key) { await log('Нет backend/key — впиши в попапе'); return; }
  await chrome.storage.local.set({ running: true });
  const QUERIES = await pickQueries();
  await log('Старт: ' + QUERIES.length + ' запросов (через вкладку WB)');
  const seen = new Set(), out = [];
  let fails = 0, tabId = null, mine = false;
  const closeTab = async () => { if (mine && tabId) { try { await chrome.tabs.remove(tabId); } catch (e) {} mine = false; } };
  for (const qq of QUERIES) {
    try {
      /* Вкладка ПЕЧАТАЕТ запрос в поиск WB как человек и читает DOM выдачи.
         Медленно (~10с), зато для wbaas неотличимо от ручной работы. */
      const t = await wbTabSend('humanSearch', null, qq);
      tabId = t.tabId; mine = t.mine;
      if (!t.res || !t.res.ok) throw new Error((t.res && t.res.error) || 'пусто');
      const list = (t.res.items || []).map(mapHuman).filter((p) => p.title && p.price > 0);
      list.forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } });
      fails = 0;
      await log('+ ' + qq + ': ' + list.length + ' (всего ' + out.length + ')');
    } catch (e) {
      fails++;
      await log('- ' + qq + ': ' + e.message);
      if (fails >= 3 && !out.length) { await log('Три провала подряд — стоп'); break; }
    }
    await sleep(PAUSE_MS);
  }
  await closeTab();
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
  await closeTab();
  await chrome.storage.local.set({ running: false, lastRun: Date.now(), lastCount: out.length });
}
function mapHuman(c) {
  return {
    id: 'wb' + c.id, nmId: c.id, title: String(c.title || '').slice(0, 120),
    price: c.price, old: Math.round(c.price * 1.2),
    /* Фото из DOM карточки (верный хост) с подъёмом tm→big;
       конструктор basket — только запасной (таблица хостов дрейфует). */
    img: (c.img && c.img.includes('/photos/')) ? c.img.replace('/tm/', '/big/') : wbPhoto(c.id),
    mp: 'WB', brand: '',
    cat: wbCat(c.title), colors: [], sizes: ['One'], styles: [], fit: 'regular',
    rating: 0, reviews: 0,
    live: true, source: 'homefeed',
    url: `https://www.wildberries.ru/catalog/${c.id}/detail.aspx`,
    fetchedAt: Date.now(), desc: ''
  };
}
/* liveQuery: страница sainvio просит ОДИН человеческий поиск под запрос
   пользователя (~10-15с). Если идёт полный сбор — отвечаем busy, страница
   молча берёт снимок. */
let __liveBusy = false;
async function runLiveQuery(query) {
  if (__liveBusy) return { busy: true };
  const o = await chrome.storage.local.get('running');
  if (o.running) return { busy: true };
  __liveBusy = true;
  let tabId = null, mine = false;
  const closeTab = async () => { if (mine && tabId) { try { await chrome.tabs.remove(tabId); } catch (e) {} mine = false; } };
  const t0 = Date.now();
  try {
    const t = await wbTabSend('humanSearch', null, String(query).slice(0, 60), true);
    tabId = t.tabId; mine = t.mine;
    if (!t.res || !t.res.ok) return { items: [] };
    const items = (t.res.items || []).map(mapHuman).filter((p) => p.title && p.price > 0).slice(0, 30);
    await log('live «' + query.slice(0, 30) + '»: ' + items.length + ' за ' + Math.round((Date.now() - t0) / 1000) + 'с');
    return { items };
  } catch (e) {
    await log('live ERR ' + e.message);
    return { items: [] };
  } finally {
    await closeTab();
    __liveBusy = false;
  }
}
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  if (m && m.type === 'collect') { runCollect(); return; }
  if (m && m.type === 'liveQuery') {
    runLiveQuery(m.query || '').then(sendResponse);
    return true;
  }
});
chrome.alarms.onAlarm.addListener((a) => { if (a && a.name === 'hf') runCollect(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('hf', { periodInMinutes: 360 }); });
