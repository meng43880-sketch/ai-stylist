'use strict';
/* persona.js — характер стилиста, промпты и ЧИСТЫЕ функции проверки ответа модели.
   Здесь нет сети и зависимостей — файл легко тестировать (см. test/stylist_test.js).
   Правило: модель только формулирует. Всё, что можно проверить кодом, проверяется здесь. */

/* ---------- Вызов А: «понять» запрос. Короткий англ. промпт = меньше токенов. ---------- */
const UNDERSTAND_SYSTEM = `You parse a fashion shopping request for a personal stylist app. Use the message, the short profile, the dialogue slots and history.
Return STRICT JSON only:
{"intent":"find_item|build_outfit|advice|chitchat",
 "hard":{"category":"top|bottom|shoes|acc|","subcategory":"","maxPrice":null,"size":""},
 "soft":{"colors":[],"styles":[],"occasion":"office|date|party|walk|sport|school|weekend|autumn|","avoid":[]},
 "missing":[],
 "suggestQuery":"short Russian marketplace phrase, 2-4 words, empty if no item wanted",
 "learned":[{"dim":"colors|style|fits","key":"","like":true}],
 "allowBudgetRelax":false}
Rules: never invent facts; unknown = empty/null. Colors from [black,white,olive,beige,gray,green,blue,brown]. Styles from [casual,smart,street,minimal,sport,oldmoney,business,classic,tech,oversize,party].
"cheaper"/"подешевле" means a lower maxPrice. "another"/"другое" keeps the previous category from slots. If the user says they dislike or avoid something (e.g. "не хочу чёрное"), put it into learned with like=false and into soft.avoid. "missing" lists only what blocks a good answer: occasion, budget, category.
Greeting or small talk: intent=chitchat, suggestQuery empty.`;

/* ---------- Вызов Б: «сказать». Русский, с характером и примерами. ---------- */
const SAY_SYSTEM = `Ты — Саша, личный стилист в приложении sainvio. Говоришь на «ты», тепло и коротко, как знающий друг, а не как продавец.
ПРАВИЛА
- Пиши ТОЛЬКО по-русски.
- Упоминай только вещи из списка items и только по их id. Не выдумывай товары, цены, бренды, состав.
- message: 2–3 предложения, до 280 символов. Сначала покажи, что понял запрос (повод, бюджет, погода), потом один главный совет.
- picks: от 2 до 4 id из items; reason — до 12 слов и строго на основе полей why и warn этой вещи.
- Если у вещи есть warn — честно упомяни это в reason.
- Не пересказывай проценты и числа из карточек, их покажет приложение.
- Если не хватает данных (повод, бюджет, куда идёшь) — задай ОДИН вопрос в question и дай 2–4 коротких варианта в quick (до 3 слов каждый). Иначе question = null, quick = [].
- Если запрос — просто разговор, отвечай по-человечески и коротко, picks = [].
ФОРМАТ: строго JSON {"message":"","picks":[{"id":"","reason":""}],"question":null,"quick":[]}
ПРИМЕР 1
Запрос: куртка на осень до 7000. Погода +6°.
Ответ: {"message":"Понял: куртка на осень, до 7 000 ₽. При +6° нужен плотный верх, так что смотрю на утеплённые. Вот что подойдёт.","picks":[{"id":"wb1","reason":"оливковый из твоей палитры, твой размер есть"},{"id":"wb2","reason":"тёплая, но тонковата для морозов"}],"question":null,"quick":[]}
ПРИМЕР 2
Запрос: что надеть на свидание. Повод и бюджет не уточнены.
Ответ: {"message":"Для свидания соберу что-нибудь аккуратное. Подскажи, куда идёте — от этого зависит, насколько нарядно.","picks":[],"question":"Куда идёте?","quick":["Ресторан","Кино","Прогулка"]}`;

/* ---------- Достаём JSON из ответа модели ---------- */
function extractJSON(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) { const e = new Error('Модель вернула не JSON'); e.code = 'BAD_JSON'; throw e; }
  try { return JSON.parse(s.slice(a, b + 1)); }
  catch (x) { const e = new Error('Не удалось разобрать JSON модели'); e.code = 'BAD_JSON'; throw e; }
}

const COLORS = ['black', 'white', 'olive', 'beige', 'gray', 'green', 'blue', 'brown'];
const STYLES = ['casual', 'smart', 'street', 'minimal', 'sport', 'oldmoney', 'business', 'classic', 'tech', 'oversize', 'party'];
const CATS = ['top', 'bottom', 'shoes', 'acc'];
const INTENTS = ['find_item', 'build_outfit', 'advice', 'chitchat'];
const OCC = ['office', 'date', 'party', 'walk', 'sport', 'school', 'weekend', 'autumn'];

/* Приводим ответ вызова А к безопасной форме. */
function normUnderstand(o) {
  o = (o && typeof o === 'object') ? o : {};
  const h = (o.hard && typeof o.hard === 'object') ? o.hard : {};
  const s = (o.soft && typeof o.soft === 'object') ? o.soft : {};
  const arr = (v, allowed) => (Array.isArray(v) ? v.map(String).filter((x) => !allowed || allowed.includes(x)) : []).slice(0, 4);
  const price = Number(h.maxPrice);
  return {
    intent: INTENTS.includes(o.intent) ? o.intent : 'find_item',
    hard: {
      category: CATS.includes(h.category) ? h.category : '',
      subcategory: typeof h.subcategory === 'string' ? h.subcategory.slice(0, 20) : '',
      maxPrice: Number.isFinite(price) && price >= 300 && price <= 500000 ? Math.round(price) : null,
      size: typeof h.size === 'string' ? h.size.slice(0, 6) : ''
    },
    soft: {
      colors: arr(s.colors, COLORS), styles: arr(s.styles, STYLES),
      occasion: OCC.includes(s.occasion) ? s.occasion : '', avoid: arr(s.avoid, COLORS)
    },
    missing: arr(o.missing).map((x) => x.slice(0, 20)),
    suggestQuery: typeof o.suggestQuery === 'string' ? o.suggestQuery.trim().slice(0, 60) : '',
    learned: (Array.isArray(o.learned) ? o.learned : []).filter((l) => l && ['colors', 'style', 'fits'].includes(l.dim) && typeof l.key === 'string'
      && (l.dim === 'colors' ? COLORS.includes(l.key) : l.dim === 'style' ? STYLES.includes(l.key) : l.key.length <= 16)).slice(0, 3)
      .map((l) => ({ dim: l.dim, key: l.key, like: l.like !== false })),
    allowBudgetRelax: o.allowBudgetRelax === true
  };
}

/* Доля кириллицы среди букв: защита от срыва маленькой модели на английский. */
function cyrRatio(s) {
  const letters = String(s || '').match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if (!letters.length) return 0;
  const cyr = letters.filter((c) => /[А-Яа-яЁё]/.test(c)).length;
  return cyr / letters.length;
}
function trimSentence(s, max) {
  s = String(s || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (i > 80 ? cut.slice(0, i + 1) : cut.replace(/[,;:\s]+\S*$/, '') + '…').trim();
}
/* Проверка ответа вызова Б. Возвращает нормализованный объект или null (= невалидно). */
function validateSay(o, allowedIds) {
  if (!o || typeof o !== 'object') return null;
  const allowed = new Set(allowedIds || []);
  let message = typeof o.message === 'string' ? o.message.trim() : '';
  if (message.length < 8 || cyrRatio(message) < 0.7) return null;
  if (message.length > 420) return null;
  message = trimSentence(message, 300);
  const picks = [];
  (Array.isArray(o.picks) ? o.picks : []).forEach((p) => {
    if (!p || !allowed.has(String(p.id)) || picks.some((x) => x.id === String(p.id))) return;
    let reason = typeof p.reason === 'string' ? p.reason.trim() : '';
    if (reason && (cyrRatio(reason) < 0.7 || reason.length > 110)) reason = '';
    picks.push({ id: String(p.id), reason });
  });
  let question = typeof o.question === 'string' ? o.question.trim() : '';
  if (question && (question.length > 140 || cyrRatio(question) < 0.7)) question = '';
  const quick = (Array.isArray(o.quick) ? o.quick : []).map((q) => String(q).trim())
    .filter((q) => q && q.length <= 26 && cyrRatio(q) >= 0.6).slice(0, 4);
  return { message, picks: picks.slice(0, 4), question: question || null, quick: question ? quick : [] };
}
/* Запасной ответ из кода, если модель недоступна или ответила мусором. */
function templateSay(crit, items, temp) {
  crit = crit || {};
  const what = { top: 'верх', bottom: 'низ', shoes: 'обувь', acc: 'аксессуары' }[crit.category] || 'вещи';
  const bits = [];
  if (crit.maxPrice) bits.push('до ' + Number(crit.maxPrice).toLocaleString('ru-RU') + ' ₽');
  if (typeof temp === 'number') bits.push('при ' + (temp > 0 ? '+' : '') + temp + '°');
  if (!items || !items.length) return { message: 'Пока ничего подходящего не нашёл. Попробуй уточнить запрос или открой поиск в магазине.', picks: [], question: null, quick: [] };
  const picks = items.slice(0, 3).map((p) => ({ id: p.id, reason: (p.why && p.why[0]) || '' }));
  return { message: `Подобрал ${what}${bits.length ? ' ' + bits.join(', ') : ''} под твой профиль. Начни с первых — они подходят лучше всего.`, picks, question: null, quick: [] };
}
module.exports = { UNDERSTAND_SYSTEM, SAY_SYSTEM, extractJSON, normUnderstand, validateSay, templateSay, cyrRatio, trimSentence };
