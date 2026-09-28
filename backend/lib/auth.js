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
module.exports = { AuthProvider, LocalAuthProvider, WbIdProvider };
