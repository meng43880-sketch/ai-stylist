'use strict';
/* auth.js — абстракция входа. Сейчас: локальный профиль без пароля.
   Будущее: WB ID (единый аккаунт Wildberries & Russ). Статус на 2026-09:
   WB ID тестируется только с B2B-партнёрами (первый — Профи.ру), открытого
   OAuth для всех нет. Когда появится: реализовать WbIdProvider по их доке
   (redirect → code → token → профиль/телефон), frontend не меняется —
   только вызов AuthService.login('wb') и кнопка «Войти через WB ID». */
class AuthProvider {
  constructor(name) { this.authName = name; }
  async getSession() { return null; }
}
class LocalAuthProvider extends AuthProvider {
  constructor() { super('local'); }
  async getSession(req) {
    return { userId: 'local', phone: null, wbLinked: false };
  }
}
class WbIdProvider extends AuthProvider {
  constructor() { super('wb-id'); }
  async getSession() {
    const e = new Error('WB ID пока доступен только B2B-партнёрам WB. Следим за открытием программы.');
    e.code = 'NOT_AVAILABLE'; e.status = 501; throw e;
  }
}

/* ---------- Логин/пароль (scrypt, без внешних зависимостей) ---------- */
const crypto = require('crypto');
const SESSION_TTL = 30 * 24 * 3600 * 1000;
function validLogin(l) { return typeof l === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(l); }
function validPassword(p) { return typeof p === 'string' && p.length >= 6 && p.length <= 72; }
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false;
    const h = crypto.scryptSync(pw, parts[1], 64);
    const ref = Buffer.from(parts[2], 'hex');
    return h.length === ref.length && crypto.timingSafeEqual(h, ref);
  } catch (e) { return false; }
}
function AuthUsers() {
  const store = require('./store');
  store.db.users = store.db.users || [];
  store.db.sessions = store.db.sessions || {};
  return store;
}
function findUser(login) {
  const store = AuthUsers();
  return store.db.users.find((u) => u.login === String(login).toLowerCase());
}
function register(login, password) {
  const Q = require('./qwen');
  if (!validLogin(login)) throw Q.err('BAD_REQUEST', 'Логин: 3–20 символов, латиница, цифры и _', 400);
  if (!validPassword(password)) throw Q.err('BAD_REQUEST', 'Пароль: минимум 6 символов', 400);
  if (findUser(login)) throw Q.err('BAD_REQUEST', 'Такой логин уже занят', 400);
  const store = AuthUsers();
  const user = { id: 'u' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), login: login.toLowerCase(), hash: hashPw(password), createdAt: Date.now() };
  store.db.users.push(user);
  store.save();
  return issueToken(user.id);
}
function issueToken(userId) {
  const store = AuthUsers();
  const token = crypto.randomBytes(32).toString('hex');
  store.db.sessions[token] = { userId, createdAt: Date.now() };
  store.save();
  return token;
}
function login(login, password) {
  const Q = require('./qwen');
  const user = findUser(login);
  if (!user || !checkPw(password || '', user.hash)) throw Q.err('AUTH', 'Неверный логин или пароль', 401);
  return { token: issueToken(user.id), login: user.login };
}
function getUserByToken(token) {
  if (!token) return null;
  const store = AuthUsers();
  const s = store.db.sessions[token];
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) { store.dropSession(token); return null; }
  const user = store.db.users.find((u) => u.id === s.userId);
  return user || null;
}
function logout(token) {
  if (!token) return;
  const store = AuthUsers();
  store.dropSession(token);
}
module.exports = { AuthProvider, LocalAuthProvider, WbIdProvider, register, login, logout, getUserByToken };
