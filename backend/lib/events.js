'use strict';
/* events.js — единый Event System (§40) + PreferenceLearningService (§25-27).
   Все значимые действия идут сюда; обучение — детерминированное (§41),
   LLM не вызывается. Событие: {t, type, pid, ctx{why, query}}.
   Веса — из taste.SIGNAL_W (§10). SEARCH двигает вкус едва-едва:
   это намерение, а не предпочтение. */
const T = require('./taste');
const C = require('./catalog');
const HF = require('./homefeed');
const MAX_EVENTS = 300;
/* Атрибуты товара для сигналов: demo → homefeed → dataset → market. Best-effort. */
async function productAttrs(id) {
  if (!id) return null;
  try {
    const d = C.DemoProductProvider.getById(id);
    if (d) return { styles: d.styles || [], colors: d.colors || [], fit: d.fit || null, pattern: null, subcategory: null, cat: d.cat };
  } catch (e) {}
  try {
    const rows = HF.getItems();
    const h = rows.find((x) => x.id === id);
    if (h) return { styles: h.styles || [], colors: h.colors || [], fit: h.fit || null, pattern: null, subcategory: h.sub || null, cat: h.cat };
  } catch (e) {}
  try {
    const D = require('./datasets');
    const rows = await D.ensureLoaded();
    const r = rows.find((x) => x.id === id);
    if (r) return { styles: r.styles || [], colors: r.colors || [], fit: r.fit || null, pattern: null, subcategory: r.sub || null, cat: r.cat };
  } catch (e) {}
  return null;
}
const TASTE_EVENTS = new Set(['like', 'dislike', 'save', 'fav', 'purchase', 'add_wardrobe', 'remove_wardrobe', 'reject', 'open', 'longview', 'open_reviews', 'open_composition']);
function ensureUser(U) {
  if (!U.taste) U.taste = T.blankTaste();
  if (!Array.isArray(U.events)) U.events = [];
  if (!Array.isArray(U.searches)) U.searches = [];
  if (!Array.isArray(U.recs)) U.recs = [];
  if (!U.measures) U.measures = { chest: null, waist: null, hips: null, shoulder: null };
  if (!U.session) U.session = {};
  return U;
}
/* type: like|dislike|save|fav|purchase|add_wardrobe|remove_wardrobe|reject|
   open|longview|open_reviews|open_composition|search|rec_shown|explicit */
async function logEvent(U, type, pid, ctx) {
  ensureUser(U);
  ctx = ctx || {};
  U.events.unshift({ t: Date.now(), type, pid: pid || null, ctx: { why: ctx.why || '', query: (ctx.query || '').slice(0, 80) } });
  U.events = U.events.slice(0, MAX_EVENTS);
  let sigCount = 0;
  if (type === 'search') {
    U.searches.unshift({ t: Date.now(), q: String(ctx.query || '').slice(0, 120), intent: String(ctx.intent || '').slice(0, 200) });
    U.searches = U.searches.slice(0, 100);
    return { sigCount };
  }
  if (type === 'rec_shown') {
    U.recs.unshift({ t: Date.now(), q: String(ctx.query || '').slice(0, 120), ids: (ctx.ids || []).slice(0, 50) });
    U.recs = U.recs.slice(0, 100);
    return { sigCount };
  }
  if (type === 'explicit' && ctx.dim && ctx.key) {
    sigCount = T.applySignal(U.taste, { dim: ctx.dim, key: ctx.key, w: ctx.like === false ? -1.2 : 1.2, explicit: true, why: ctx.why || 'explicit' });
    return { sigCount };
  }
  if (!TASTE_EVENTS.has(type) || !pid) return { sigCount };
  const w = T.SIGNAL_W[type];
  if (!w) return { sigCount };
  const attrs = await productAttrs(pid);
  if (!attrs) return { sigCount };
  T.signalsFromAttrs(attrs, w, `${type}:${pid}`).forEach((s) => { sigCount += T.applySignal(U.taste, s); });
  return { sigCount };
}
function logRec(U, query, ids) {
  ensureUser(U);
  U.recs.unshift({ t: Date.now(), q: String(query || '').slice(0, 120), ids: (ids || []).slice(0, 50) });
  U.recs = U.recs.slice(0, 100);
}
module.exports = { logEvent, logRec, ensureUser, productAttrs };
