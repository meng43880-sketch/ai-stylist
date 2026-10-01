'use strict';
/* store.js — хранилище с двумя режимами:
   - без DATABASE_URL: локальный db.json (разработка);
   - с DATABASE_URL: Postgres (Neon и др.), схема — таблицы users, sessions,
     user_data (весь личный JSON юзера), cache, usage.
   Оба режима expose один синхронный API: весь код выше (роуты, оркестратор,
   auth) не меняется. В PG-режиме держим in-memory зеркало, а запись идёт
   отложенным flush (debounce) — редеплой данные уже не убивает.
   Важно: init() нужно дождаться до listen (см. server.js). */
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PG_URL = process.env.DATABASE_URL || '';
function blank() {
  return { profile: null, vision: null, favorites: [], outfits: [], wardrobe: [], usage: {}, feedback: { likes: {}, dislikes: {}, styleW: {}, colorW: {} }, history: [], chats: {}, users: [], sessions: {}, data: {}, community: {}, cache: { analyses: {}, recs: {}, outfits: {}, queries: {}, weather: null, market: {} } };
}
function freshUserData() {
  return { profile: null, vision: null, favorites: [], outfits: [], wardrobe: [], feedback: { likes: {}, dislikes: {}, styleW: {}, colorW: {} }, history: [], chats: {} };
}
let db = blank();
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
try {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const p = JSON.parse(raw);
  if (p && typeof p === 'object') db = Object.assign(blank(), p);
} catch { /* первый запуск */ }

let pool = null;
const dirtyCache = new Set();
let flushT = null;

async function init() {
  if (!PG_URL) { console.log('store: JSON mode (db.json)'); return; }
  let pg;
  try { pg = require('pg'); } catch (e) { throw new Error('DATABASE_URL задан, но пакет pg не установлен: cd backend && npm install'); }
  pool = new pg.Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, created_at BIGINT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at BIGINT);
    CREATE TABLE IF NOT EXISTS user_data(user_id TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS cache(ns TEXT NOT NULL, key TEXT NOT NULL, data JSONB NOT NULL, ts BIGINT NOT NULL, PRIMARY KEY(ns,key));
    CREATE TABLE IF NOT EXISTS usage(tag TEXT PRIMARY KEY, input BIGINT DEFAULT 0, output BIGINT DEFAULT 0, calls BIGINT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS community(key TEXT PRIMARY KEY, data JSONB NOT NULL, by_user TEXT NOT NULL, created_at BIGINT);`);
  const [u, s, d, c, g] = await Promise.all([
    pool.query('SELECT id, login, hash, created_at FROM users'),
    pool.query('SELECT token, user_id, created_at FROM sessions'),
    pool.query('SELECT user_id, data FROM user_data'),
    pool.query('SELECT ns, key, data, ts FROM cache'),
    pool.query('SELECT tag, input, output, calls FROM usage')
  ]);
  db.users = u.rows.map((r) => ({ id: r.id, login: r.login, hash: r.hash, createdAt: Number(r.created_at) }));
  db.sessions = {};
  s.rows.forEach((r) => { db.sessions[r.token] = { userId: r.user_id, createdAt: Number(r.created_at) }; });
  db.data = {};
  d.rows.forEach((r) => { db.data[r.user_id] = Object.assign(freshUserData(), r.data || {}); });
  db.cache = blank().cache;
  c.rows.forEach((r) => { (db.cache[r.ns] = db.cache[r.ns] || {})[r.key] = { ts: Number(r.ts), data: r.data }; });
  db.usage = {};
  g.rows.forEach((r) => { db.usage[r.tag] = { in: Number(r.input), out: Number(r.output), calls: Number(r.calls) }; });
  db.community = {};
  try {
    const cm = await pool.query('SELECT key, data FROM community');
    cm.rows.forEach((r) => { db.community[r.key] = r.data; });
    console.log(`store: PG mode — users:${db.users.length} sessions:${s.rows.length} profiles:${d.rows.length} cache:${c.rows.length} community:${cm.rows.length}`);
  } catch (e) { console.log('store: community table missing?', e.message); }
  const flushExit = async () => { try { clearTimeout(flushT); await flushNow(); } catch (e) {} };
  process.on('SIGTERM', () => flushExit().then(() => process.exit(0)));
}
async function flushNow() {
  if (!pool) return;
  const q = (t, v) => pool.query(t, v);
  for (const u of db.users) await q('INSERT INTO users(id,login,hash,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET login=$2,hash=$3', [u.id, u.login, u.hash, u.createdAt]);
  for (const [t, s] of Object.entries(db.sessions)) await q('INSERT INTO sessions(token,user_id,created_at) VALUES($1,$2,$3) ON CONFLICT(token) DO NOTHING', [t, s.userId, s.createdAt]);
  for (const [uid, data] of Object.entries(db.data)) await q('INSERT INTO user_data(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=$2', [uid, JSON.stringify(data)]);
  for (const [tag, u] of Object.entries(db.usage)) await q('INSERT INTO usage(tag,input,output,calls) VALUES($1,$2,$3,$4) ON CONFLICT(tag) DO UPDATE SET input=$2,output=$3,calls=$4', [tag, u.in || 0, u.out || 0, u.calls || 0]);
  for (const [key, data] of Object.entries(db.community || {})) {
    const meta = data && data._meta ? data._meta : { by: '?', at: Date.now() };
    await q('INSERT INTO community(key,data,by_user,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO NOTHING', [key, JSON.stringify(data), meta.by, meta.at]);
  }
  if (dirtyCache.size) {
    for (const k of dirtyCache) {
      const i = k.indexOf(':'); const ns = k.slice(0, i), key = k.slice(i + 1);
      const c = db.cache[ns] && db.cache[ns][key];
      if (!c) await q('DELETE FROM cache WHERE ns=$1 AND key=$2', [ns, key]);
      else await q('INSERT INTO cache(ns,key,data,ts) VALUES($1,$2,$3,$4) ON CONFLICT(ns,key) DO UPDATE SET data=$3,ts=$4', [ns, key, JSON.stringify(c.data), c.ts]);
    }
    dirtyCache.clear();
  }
}
let saveT = null;
function save() {
  if (!pool) {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {} }, 200);
    return;
  }
  clearTimeout(flushT);
  flushT = setTimeout(() => { flushNow().catch((e) => console.error('pg flush', e.message)); }, 1500);
}
function UD(uid) {
  db.data = db.data || {};
  db.data[uid] = db.data[uid] || freshUserData();
  return db.data[uid];
}
function getCache(ns, key, ttlMs) {
  const c = db.cache[ns] && db.cache[ns][key];
  if (!c) return null;
  if (Date.now() - c.ts > ttlMs) { delete db.cache[ns][key]; dirtyCache.add(ns + ':' + key); return null; }
  return c.data;
}
function setCache(ns, key, data) {
  db.cache[ns] = db.cache[ns] || {};
  db.cache[ns][key] = { ts: Date.now(), data };
  dirtyCache.add(ns + ':' + key);
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
module.exports = { db, save, init, getCache, setCache, logHistory, UD, dropSession };
async function dropSession(token) {
  delete db.sessions[token];
  if (pool) { try { await pool.query('DELETE FROM sessions WHERE token=$1', [token]); } catch (e) {} }
  else save();
}
