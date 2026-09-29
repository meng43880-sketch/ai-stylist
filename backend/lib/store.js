'use strict';
/* store.js — простая JSON-база + TTL-кеш. Без внешних зависимостей.
   Хранит: профиль, vision, избранное, образы, фидбек, историю, диалоги,
   кеш анализов товаров, кеш рекомендаций. Фото храним только до анализа. */
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
function blank() {
  return { profile: null, vision: null, favorites: [], outfits: [], wardrobe: [], usage: {}, feedback: { likes: {}, dislikes: {}, styleW: {}, colorW: {} }, history: [], chats: {}, users: [], sessions: {}, data: {}, cache: { analyses: {}, recs: {}, outfits: {}, queries: {}, weather: null } };
}
/* Данные в разрезе пользователя: всё личное (профиль, избранное, гардероб,
   история, диалоги) изолировано по userId. Общее (кеш анализов, usage) — глобально. */
function freshUserData() {
  return { profile: null, vision: null, favorites: [], outfits: [], wardrobe: [], feedback: { likes: {}, dislikes: {}, styleW: {}, colorW: {} }, history: [], chats: {} };
}
function UD(uid) {
  db.data = db.data || {};
  db.data[uid] = db.data[uid] || freshUserData();
  return db.data[uid];
}
let db = blank();
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
try {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const p = JSON.parse(raw);
  if (p && typeof p === 'object') db = Object.assign(blank(), p);
} catch { /* первый запуск */ }
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {} }, 200);
}
function getCache(ns, key, ttlMs) {
  const c = db.cache[ns] && db.cache[ns][key];
  if (!c) return null;
  if (Date.now() - c.ts > ttlMs) { delete db.cache[ns][key]; return null; }
  return c.data;
}
function setCache(ns, key, data) {
  db.cache[ns] = db.cache[ns] || {};
  db.cache[ns][key] = { ts: Date.now(), data };
  save();
}
function logHistory(type, text, uid) {
  const entry = { t: Date.now(), type, text: String(text).slice(0, 200) };
  if (uid) {
    const h = UD(uid).history;
    h.unshift(entry);
    UD(uid).history = h.slice(0, 100);
  } else {
    db.history.unshift(entry);
    db.history = db.history.slice(0, 100);
  }
  save();
}
module.exports = { db, save, getCache, setCache, logHistory, UD };
