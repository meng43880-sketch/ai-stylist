'use strict';
/* popup.js — вход своим логином из приложения + чтение открытой карточки
   + отправка в POST /api/collect. Пароль нигде не хранится, только токен. */
const $ = (id) => document.getElementById(id);
const DEFAULT_BASE = 'https://ai-stylist-u58z.onrender.com';
async function store() {
  const d = await chrome.storage.local.get(['base', 'token', 'login']);
  return { base: d.base || DEFAULT_BASE, token: d.token || '', login: d.login || '' };
}
function say(t, cls) {
  const el = $('status');
  el.className = cls || '';
  el.textContent = t;
}
async function api(path, opts, token) {
  const { base } = await store();
  const r = await fetch(base.replace(/\/$/, '') + path, Object.assign({
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {})
  }, opts || {}));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j;
}
async function ensureContent(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (e) { /* уже внедрён */ }
}
async function readPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('Нет активной вкладки');
  if (!/^https:\/\/(www\.)?(wildberries\.ru|ozon\.ru)\//.test(tab.url || '')) throw new Error('Открой карточку товара на WB или Ozon');
  await ensureContent(tab.id);
  const res = await chrome.tabs.sendMessage(tab.id, { action: 'parse' });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Страница не отвечает');
  return res.product;
}
async function refresh() {
  const st = await store();
  if (!st.token) {
    $('authbox').style.display = '';
    $('mainbox').style.display = 'none';
    $('f_base').value = st.base;
    $('f_login').value = st.login;
    $('who').textContent = 'Войди своим логином из приложения.';
    return;
  }
  $('authbox').style.display = 'none';
  $('mainbox').style.display = '';
  $('who').textContent = 'Вошёл как ' + st.login + '. Открой товар и жми «Сохранить».';
  say('Читаю страницу…');
  try {
    const p = await readPage();
    window._product = p;
    $('p_img').src = p.img || '';
    $('p_title').textContent = p.title;
    $('p_price').textContent = p.price ? p.price.toLocaleString('ru-RU') + ' ₽' + (p.brand ? ' · ' + p.brand : '') : '';
    say('');
  } catch (e) { say(e.message, 'err'); }
}
$('b_login').onclick = async () => {
  const base = ($('f_base').value || '').trim().replace(/\/$/, '') || DEFAULT_BASE;
  const login = ($('f_login').value || '').trim();
  const password = $('f_pass').value || '';
  if (!login || !password) { say('Введи логин и пароль', 'err'); return; }
  say('Вхожу…');
  try {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    }).then((x) => x.json());
    if (!r.ok) throw new Error(r.error || 'Не получилось');
    await chrome.storage.local.set({ base, token: r.token, login: r.login });
    say('');
    refresh();
  } catch (e) { say('Вход: ' + e.message, 'err'); }
};
$('b_save').onclick = async () => {
  const p = window._product;
  if (!p) { say('Сначала открой карточку товара', 'err'); return; }
  say('Сохраняю…');
  try {
    const st = await store();
    const r = await api('/api/collect', { method: 'POST', body: JSON.stringify(p) }, st.token);
    say(r.data && r.data.isNew ? 'Готово — товар в общей базе.' : 'Такой товар уже есть в базе.', 'ok');
  } catch (e) { say('Ошибка: ' + e.message, 'err'); }
};
$('b_reload').onclick = () => refresh();
$('b_go').onclick = async () => {
  const target = parseInt($('f_target').value) || 200;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/(www\.)?wildberries\.ru\//.test(tab.url || '')) { say('Открой поиск или каталог WB', 'err'); return; }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    await chrome.storage.local.set({ ap: { running: true, target, done: 0, errors: 0, page: 1, seen: {}, note: 'Стартую…' } });
    chrome.tabs.sendMessage(tab.id, { action: 'autopilot', cmd: { target } });
    say('Автопилот запущен. Вкладку можно свернуть, но не закрывать.', 'ok');
    pollAp();
  } catch (e) { say('Не стартовал: ' + e.message, 'err'); }
};
async function pollAp() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: 'apstate' }, (res) => {
      const ap = res && res.ap;
      const el = $('apstatus');
      if (el && ap) el.textContent = (ap.running ? 'Работаю: ' : 'Стоп: ') + (ap.done || 0) + ' / ' + (ap.target || '?') + (ap.note ? ' · ' + ap.note : '');
      if (ap && ap.running) setTimeout(pollAp, 2000);
    });
  } catch (e) {}
}
$('b_stop').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'autopilot', cmd: { stop: true } });
  } catch (e) {}
};
$('b_logout').onclick = async () => {
  const st = await store();
  try { await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({ token: st.token }) }); } catch (e) {}
  await chrome.storage.local.remove(['token']);
  refresh();
};
refresh();
