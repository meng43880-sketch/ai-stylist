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
  /* Авточинка только что собранного: чиним фото сразу, без кнопки. */
  try {
    await log('Чиню фото собранного…');
    const n = (await healList(out, null)).length;
    await log('Починено: ' + n + ' из ' + out.length);
  } catch (e) { await log('heal ERR ' + e.message); }
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
    /* Автопочинка фото свежих — сразу, без кнопки. С потолком 20с:
       что не успело — добьёт каскад в показе, выдача не ждёт. */
    try {
      const s0 = items[0] || {};
      await log('образец img: ' + String(s0.img || '(пусто)').slice(0, 120));
      const healed = await Promise.race([
        healList(items, async (m) => { await log(m); }),
        sleep(20000).then(() => [])
      ]);
      await log('live «' + query.slice(0, 30) + '»: ' + items.length + ', фото чинено ' + healed.length + ' за ' + Math.round((Date.now() - t0) / 1000) + 'с');
    } catch (e) {
      await log('live «' + query.slice(0, 30) + '»: ' + items.length + ' (без чинки)');
    }
    return { items };
  } catch (e) {
    await log('live ERR ' + e.message);
    return { items: [] };
  } finally {
    await closeTab();
    __liveBusy = false;
  }
}
/* Починка фото без пересбора: группируем хранимые URL по vol, для каждого
   тома находим живой хост пробами (статус + первый чанк, тело не качаем)
   и переписываем img в хранилище через обычный push (merge по id). */
async function probePhoto(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) { clearTimeout(t); return false; }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('image')) { clearTimeout(t); try { await r.arrayBuffer(); } catch (e) {} return false; }
    const reader = r.body.getReader();
    const { value } = await reader.read();
    try { reader.cancel(); } catch (e) {}
    clearTimeout(t);
    return value && value.byteLength > 1000;
  } catch (e) { return false; }
}
/* Общая чистка фото: группирует по vol, находит живой хост пробами,
   переписывает img НА МЕСТЕ и возвращает минимальный список для пуша. */
async function healList(items, say) {
  const parseImg = (img) => {
    const m = String(img).match(/basket-(\d+)\.(wb\.ru|wbbasket\.ru)\/vol(\d+)\/part(\d+)\/(\d+)\/(photos|images)\/(big|tm)\/(\d+)\.webp/);
    if (!m) return null;
    return { host: m[1], vol: m[3], part: m[4], nmId: m[5] };
  };
  const groups = new Map();
  items.forEach((p) => {
    const q = parseImg(p.img);
    if (!q) return;
    if (!groups.has(q.vol)) groups.set(q.vol, { host: q.host, sampleQ: q, list: [] });
    groups.get(q.vol).list.push({ p, q });
  });
  if (say) await say('Томов: ' + groups.size);
  /* Кэш выученных хостов: живьё чинится за секунды, полный перебор —
     только для невиданных томов. */
  let hostmap = {};
  try { hostmap = (await chrome.storage.local.get('hostmap')).hostmap || {}; } catch (e) {}
  const saveMap = async () => { try { await chrome.storage.local.set({ hostmap }); } catch (e) {} };
  const fixed = [];
  for (const [vol, g] of groups) {
    const cand = [];
    const known = hostmap[vol];
    if (known) cand.push([known.host, known.dom, known.path]);
    cand.push([g.host, 'wbbasket.ru', 'images'], [g.host, 'wb.ru', 'photos']);
    for (let h = 1; h <= 33; h++) {
      const hh = String(h).padStart(2, '0');
      if (hh !== g.host && (!known || hh !== known.host)) cand.push([hh, 'wbbasket.ru', 'images']);
    }
    let win = null;
    for (const [hh, dom, path] of cand) {
      const u = `https://basket-${hh}.${dom}/vol${vol}/part${g.sampleQ.part}/${g.sampleQ.nmId}/${path}/big/1.webp`;
      if (await probePhoto(u)) { win = { host: hh, dom, path }; break; }
      await chrome.storage.local.set({}); // держим воркер живым
    }
    if (win) {
      g.list.forEach(({ p, q }) => {
        const img = `https://basket-${win.host}.${win.dom}/vol${vol}/part${q.part}/${q.nmId}/${win.path}/big/1.webp`;
        p.img = img;
        fixed.push({ id: p.id, title: p.title, price: p.price, img });
      });
      hostmap[vol] = win;
      if (say) await say(`vol${vol}: хост ${win.host} (${g.list.length} шт)`);
    } else if (say) await say(`vol${vol}: не нашёлся — пропускаю`);
  }
  await saveMap();
  return fixed;
}
async function healPhotos() {
  const st0 = await chrome.storage.local.get('running');
  if (st0.running) { await log('Уже идёт сбор — дождись конца'); return; }
  const cfg = await chrome.storage.local.get(['backend', 'key']);
  const backend = (cfg.backend || '').replace(/\/$/, '');
  const key = cfg.key || '';
  if (!backend || !key) { await log('Нет backend/key — впиши в попапе'); return; }
  await chrome.storage.local.set({ running: true });
  await log('Чиню фото: забираю список…');
  let items = [];
  try {
    const r = await fetch(backend + '/api/collector/status?dump=1');
    const j = await r.json();
    items = (((j && j.data) || {}).dump || []).filter((p) => p && p.id && p.img);
  } catch (e) { await log('dump ERR ' + e.message); await chrome.storage.local.set({ running: false }); return; }
  const fixed = await healList(items, async (msg) => { await log(msg); });
  if (fixed.length) {
    try {
      const r = await fetch(backend + '/api/collector/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-collector-key': key },
        body: JSON.stringify({ items: fixed })
      });
      await log('push -> HTTP ' + r.status + ', чинено ' + fixed.length);
    } catch (e) { await log('push ERR ' + e.message); }
  }
  await chrome.storage.local.set({ running: false, lastRun: Date.now(), lastCount: fixed.length });
}
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  if (m && m.type === 'collect') { runCollect(); return; }
  if (m && m.type === 'heal') { healPhotos(); return; }
  if (m && m.type === 'liveQuery') {
    runLiveQuery(m.query || '').then(sendResponse);
    return true;
  }
});
chrome.alarms.onAlarm.addListener((a) => { if (a && a.name === 'hf') runCollect(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('hf', { periodInMinutes: 360 }); });
