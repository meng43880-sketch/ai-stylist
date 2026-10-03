'use strict';
/* taste.js — TasteProfile: многомерный вкус пользователя (§7-11, §25-27).
   Структура: {style:{}, colors:{}, fits:{}, patterns:{}} — записи
   {value 0..1, conf 0..1, n, src: explicit|inferred, ts};
   скаляры quality/priceSens/brandImp/novelty — {value, conf, n}.
   Обучение — только детерминированными апдейтами (LLM не дёргаем, §41):
   накопительно, с затуханием шага и ростом confidence от evidence.
   Каждое изменение — в changes[] (PreferenceChangeLog, cap 200). */
const DIMS = ['style', 'colors', 'fits', 'patterns'];
const SCALARS = ['quality', 'priceSens', 'brandImp', 'novelty'];
/* Веса сигналов (§10): purchase/save/fav/wardrobe — сильные; open — слабый;
   dislike/reject — отрицательные; search — только намерение (0.15, вкус не двигает). */
const SIGNAL_W = {
  purchase: 1.5, save: 1.2, fav: 1.2, add_wardrobe: 1.2,
  like: 1.0, open: 0.25, longview: 0.5, open_reviews: 0.3, open_composition: 0.2,
  dislike: -1.2, reject: -0.8, remove_wardrobe: -0.6, search: 0.15
};
function blankTaste() {
  const t = { style: {}, colors: {}, fits: {}, patterns: {} };
  SCALARS.forEach((k) => { t[k] = { value: 0.5, conf: 0.1, n: 0 }; });
  t.changes = [];
  t.summary = { text: '', ts: 0, level: 0 };
  return t;
}
function entry() { return { value: 0.5, conf: 0.1, n: 0, src: 'inferred', ts: 0 }; }
/* Один шаг обучения: lr затухает с ростом evidence (1/(1+n*0.5)),
   явное (explicit) учится в 2 раза сильнее и помечается источником. */
function step(cur, w, explicit) {
  const e = cur || entry();
  /* Явное предпочтение (§11, §32) — вес выше: с первого касания встаёт
     уверенно, дальше учится как обычно. */
  if (explicit && !e.n) {
    return { value: w > 0 ? 0.75 : 0.25, conf: 0.55, n: 2, src: 'explicit', ts: Date.now() };
  }
  const lr = (explicit ? 0.16 : 0.08) * Math.min(1, Math.abs(w)) / (1 + e.n * 0.15);
  const target = w > 0 ? 1 : 0;
  const value = Math.max(0.02, Math.min(0.98, e.value + (target - e.value) * lr + Math.sign(w) * 0.004));
  const n = e.n + 1;
  const conf = Math.min(0.95, 0.1 + 0.9 * (n / (n + 6)));
  return { value: Math.round(value * 1000) / 1000, conf: Math.round(conf * 1000) / 1000, n, src: explicit ? 'explicit' : (e.src === 'explicit' && Math.sign(w) > 0 ? 'explicit' : 'inferred'), ts: Date.now() };
}
function logChange(taste, param, oldV, newV, src, why) {
  taste.changes.unshift({ ts: Date.now(), param, old: oldV, value: newV, src, why: String(why || '').slice(0, 80) });
  taste.changes = taste.changes.slice(0, 200);
}
/* Сигнал: {dim, key, w} | {scalar, w} | явное {explicit:true}.
   Возвращает число затронутых параметров (для учёта значимости). */
function applySignal(taste, sig) {
  if (!taste || !sig || typeof sig.w !== 'number' || !sig.w) return 0;
  let n = 0;
  const touch = (holder, key, explicit) => {
    const before = (holder[key] || {}).value;
    holder[key] = step(holder[key], sig.w, explicit);
    if (holder[key].value !== before) { logChange(taste, key, before, holder[key].value, explicit ? 'explicit' : 'inferred', sig.why); n++; }
  };
  if (sig.dim && DIMS.includes(sig.dim) && sig.key) {
    taste[sig.dim] = taste[sig.dim] || {};
    touch(taste[sig.dim], String(sig.key).slice(0, 24), !!sig.explicit);
  } else if (sig.scalar && SCALARS.includes(sig.scalar)) {
    const sc = taste[sig.scalar] || { value: 0.5, conf: 0.1, n: 0 };
    const before = sc.value;
    const upd = step(sc, sig.w, !!sig.explicit);
    taste[sig.scalar] = Object.assign({}, upd);
    if (upd.value !== before) { logChange(taste, sig.scalar, before, upd.value, sig.explicit ? 'explicit' : 'inferred', sig.why); n++; }
  }
  return n;
}
/* Разложить атрибуты товара в сигналы веса w (лайк/дизлайк/просмотр…). */
function signalsFromAttrs(attrs, w, why) {
  const out = [];
  if (!attrs) return out;
  (attrs.styles || []).slice(0, 3).forEach((s) => out.push({ dim: 'style', key: s, w, why }));
  (attrs.colors || []).slice(0, 2).forEach((c) => out.push({ dim: 'colors', key: c, w, why }));
  if (attrs.fit) out.push({ dim: 'fits', key: attrs.fit, w: w * 0.8, why });
  if (attrs.pattern) out.push({ dim: 'patterns', key: attrs.pattern, w: w * 0.7, why });
  if (attrs.subcategory) out.push({ dim: 'patterns', key: 'type:' + attrs.subcategory, w: w * 0.4, why });
  return out;
}
/* Топ-N предпочтений измерения (для контекста AI и TEST4/5). */
function topOf(taste, dim, n, minConf) {
  const d = (taste && taste[dim]) || {};
  return Object.entries(d)
    .filter(([, e]) => e && e.conf >= (minConf == null ? 0.3 : minConf))
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, n || 3)
    .map(([k, e]) => ({ key: k, value: e.value, conf: e.conf, n: e.n, src: e.src }));
}
/* Негативы: уверенная нелюбовь (для фильтров и TEST5). */
function negatives(taste, dim) {
  const d = (taste && taste[dim]) || {};
  return Object.entries(d)
    .filter(([, e]) => e && e.value < 0.35 && e.conf >= 0.5)
    .map(([k]) => k);
}
/* Уровень зрелости профиля (§43): 0..6 по evidence. */
function level(taste) {
  if (!taste) return 0;
  let n = 0;
  DIMS.forEach((d) => Object.values(taste[d] || {}).forEach((e) => { n += (e && e.n) || 0; }));
  if (n >= 120) return 6;
  if (n >= 60) return 5;
  if (n >= 25) return 4;
  if (n >= 8) return 3;
  if (n >= 2) return 2;
  return n > 0 ? 1 : 0;
}
/* Детерминированный taste summary (§42): без LLM, честно по цифрам. */
function summarize(taste, profile) {
  const bits = [];
  DIMS.forEach((d) => {
    const t = topOf(taste, d, 2, 0.45);
    if (t.length) bits.push(d + ': ' + t.map((x) => `${x.key} (${Math.round(x.value * 100)}%)`).join(', '));
  });
  const q = taste && taste.quality;
  const ps = taste && taste.priceSens;
  let s = bits.length ? 'Вкус: ' + bits.join('; ') + '.' : 'Вкусовых сигналов пока мало.';
  if (q && q.conf > 0.4) s += ` Качество важно на ${Math.round(q.value * 100)}%.`;
  if (ps && ps.conf > 0.4) s += ps.value > 0.6 ? ' Чувствителен к цене.' : ' Цена вторична.';
  const styles = (profile && profile.styles) || [];
  if (styles.length) s += ' Заявленные стили: ' + styles.join(', ') + '.';
  return s;
}
module.exports = { DIMS, SCALARS, SIGNAL_W, blankTaste, applySignal, signalsFromAttrs, topOf, negatives, level, summarize };
