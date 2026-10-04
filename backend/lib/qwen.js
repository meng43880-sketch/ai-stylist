'use strict';
/* qwen.js — единый клиент для Qwen-совместимых API (OpenAI-формат /chat/completions).
   Работает и с Qwen Cloud, и с self-hosted Qwen (достаточно сменить BASE_URL).
   Frontend этот файл никогда не видит. */
function err(code, message, status) { const e = new Error(message); e.code = code; e.status = status || 500; return e; }
function isConfigured(p) { return Boolean(p && p.key && p.base && p.model); }
/* Учёт токенов: складываем usage из ответов API по тегам.
   Персистим в db.usage — видно реальные цифры в GET /api/status. */
function noteUsage(tag, u) {
  if (!tag || !u) return;
  try {
    const store = require('./store');
    store.db.usage = store.db.usage || {};
    const cur = store.db.usage[tag] || { in: 0, out: 0, calls: 0 };
    cur.in += u.prompt_tokens || 0;
    cur.out += u.completion_tokens || 0;
    cur.calls += 1;
    store.db.usage[tag] = cur;
    store.save();
  } catch (e) { /* учёт не должен ронять запросы */ }
}
/* Достаём JSON из ответа модели: иногда модель добавляет текст вокруг. */
function extractJSON(text) {
  if (!text) throw err('EMPTY_RESPONSE', 'Пустой ответ модели');
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw err('BAD_JSON', 'Модель вернула не JSON');
  try { return JSON.parse(text.slice(a, b + 1)); }
  catch { throw err('BAD_JSON', 'Не удалось разобрать JSON модели'); }
}
/* Цепочка: primary → free (dots, nemo, быстрые таймауты) → платная.
   Мёртвых моделей нет, долбёжки нет: макс. 5 попыток, дальше — честная ошибка. */
const FREE_TIMEOUT = 12000, PAID_TIMEOUT = 25000, MAX_ATTEMPTS = 5;
async function chatComplete(provider, { messages, tools, temperature, timeoutMs, tag, maxTokens }) {
  const payload = (withFormat, model) => Object.assign({
    model: model || provider.model, messages,
    temperature: temperature == null ? 0.3 : temperature,
    response_format: (tools || !withFormat) ? undefined : { type: 'json_object' },
    tools: tools || undefined
  }, maxTokens ? { max_tokens: maxTokens } : {});
  const queue = [{ m: provider.model, paid: false, to: timeoutMs || 20000 }];
  (provider.free || []).forEach((f) => queue.push({ m: f, paid: false, to: FREE_TIMEOUT }));
  if (provider.paid) queue.push({ m: provider.paid, paid: true, to: PAID_TIMEOUT });
  const tried = new Set();
  let res = null, used = '', last429 = false, lastErr = null, paidTried = false;
  let attempts = 0;
  for (const q of queue) {
    if (!q.m || tried.has(q.m) || attempts >= MAX_ATTEMPTS) continue;
    tried.add(q.m);
    attempts++;
    if (q.paid) paidTried = true;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), q.to);
    const post = (body) => fetch(provider.base + '/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.key },
      body: JSON.stringify(body)
    });
    try {
      res = await post(payload(true, q.m));
      if (res.status === 400 && !tools) {
        try {
          const txt = await res.clone().text();
          if (txt.toLowerCase().includes('response_format')) res = await post(payload(false, q.m));
        } catch (e) { /* оставляем исходный ответ */ }
      }
      if (res.status === 429) {
        last429 = true;
        try {
          const body = await res.clone().json();
          const alts = body && ((body.metadata && body.metadata.alternatives) || (body.error && body.error.metadata && body.error.metadata.alternatives)) || [];
          alts.forEach((a) => { if (a && !tried.has(a) && queue.length < 8) queue.push({ m: a, paid: false, to: FREE_TIMEOUT }); });
        } catch (e) { /* без альтернатив — дальше по списку */ }
        res = null;
        clearTimeout(t);
        continue;
      }
      used = q.m;
      clearTimeout(t);
      break;
    } catch (e) {
      clearTimeout(t);
      res = null;
      lastErr = (e && e.name === 'AbortError')
        ? err('TIMEOUT', `Модель ${q.m} не ответила за ${Math.round(q.to / 1000)}с`)
        : err('UNAVAILABLE', `Модель ${q.m} недоступна`);
      continue;
    }
  }
  if (!res) {
    if (paidTried && lastErr) throw lastErr;
    if (last429) throw err('RATE_LIMIT', 'Free-модели заняты, платная не спасла. Попробуй через минуту.');
    throw lastErr || err('UNAVAILABLE', 'AI-провайдер недоступен');
  }
  if (res.status === 401 || res.status === 403) throw err('AUTH', 'Недействительный API-ключ');
  if (res.status === 402) throw err('NO_FUNDS', 'Нулевой баланс на шлюзе. Пополни счёт — запрос стоит доли рубля.');
  if (!res.ok) throw err('PROVIDER', `Ошибка AI-провайдера (${used || '?'}): HTTP ` + res.status, 502);
  let data;
  try { data = await res.json(); } catch { throw err('BAD_JSON', 'Некорректный ответ провайдера'); }
  const choice = data && data.choices && data.choices[0];
  if (!choice) throw err('EMPTY_RESPONSE', 'Пустой ответ модели');
  noteUsage(tag, data.usage);
  if (tag && used) lastUsed[tag] = used;
  return choice.message || {};
}
/* Какая модель реально ответила (по тегу): для честных логов вместо CFG. */
const lastUsed = {};
function getLastModel(tag) { return (tag && lastUsed[tag]) || ''; }
/* chatJSON: structured output с валидацией и одной повторной попыткой. */
async function chatJSON(provider, { system, user, images, required, retries, tag, maxTokens }) {
  if (!isConfigured(provider)) throw err('NOT_CONFIGURED', 'AI-провайдер не настроен');
  const content = [{ type: 'text', text: user }];
  (images || []).forEach((u) => content.push({ type: 'image_url', image_url: { url: u } }));
  const messages = [{ role: 'system', content: system }, { role: 'user', content }];
  let last;
  for (let i = 0; i < (retries == null ? 1 : retries) + 1; i++) {
    try {
      const msg = await chatComplete(provider, { messages, tag, maxTokens });
      const obj = extractJSON(msg.content || '');
      if (required && required.length) {
        const miss = required.filter((k) => obj[k] === undefined);
        if (miss.length) throw err('BAD_JSON', 'В ответе нет полей: ' + miss.join(', '));
      }
      return obj;
    } catch (e) { last = e; if (e.code !== 'BAD_JSON') throw e; }
  }
  throw last;
}
module.exports = { isConfigured, chatComplete, chatJSON, err, getLastModel };
