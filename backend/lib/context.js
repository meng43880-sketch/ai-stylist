'use strict';
/* context.js — UserContext (§29-31) + SearchIntent (§14-18).
   UserContext: read-only сводка для AI#2, собирается актуально (§47),
   без километровых историй — только топы и саммари (§30).
   SearchIntent: hard constraints (категория/пол/размер/бюджет) отдельно
   от soft (стили/цвета/посадки), 3 уровня запроса (§16), smart relaxation (§18). */
const R = require('./recommend');
const T = require('./taste');
const EV = require('./events');

function summarizeWardrobe(U) {
  const items = U.wardrobe || [];
  const titles = items.slice(0, 12).map((w) => `${w.title} (${w.cat}${(w.colors || []).length ? ', ' + w.colors.join('/') : ''})`);
  let ins = null;
  try { ins = R.wardrobeInsights(items); } catch (e) {}
  return { count: items.length, titles, note: ins ? ins.note : '', gaps: ins ? ins.gaps : [], colors: ins ? ins.colors : [], styles: ins ? ins.styles : [] };
}
function summarizeEvents(U) {
  const out = [];
  (U.events || []).slice(0, 60).forEach((e) => {
    if (['like', 'dislike', 'save', 'fav', 'purchase', 'reject', 'add_wardrobe'].includes(e.type)) {
      out.push(`${e.type}:${e.pid || ''}`);
      if (out.length >= 8) return;
    }
  });
  return out.slice(0, 8);
}
/* Read-only контекст для AI#2. Ничего лишнего: топы вкуса, негативы,
   саммари гардероба/истории, сессия (§12), уровень зрелости (§43). */
function buildUserContext(U, opts) {
  opts = opts || {};
  EV.ensureUser(U);
  const taste = U.taste || T.blankTaste();
  const ctx = {
    profile: U.profile || null,
    measures: U.measures || null,
    visual: U.vision ? {
      style_signals: U.vision.style_signals || U.vision.recommended_styles || [],
      colors: U.vision.colors || U.vision.recommended_colors || [],
      fits: U.vision.fits || U.vision.recommended_fits || [],
      confidence: U.vision.confidence || null
    } : null,
    style_declared: ((U.profile && U.profile.styles) || []),
    taste: {
      style: T.topOf(taste, 'style', 3),
      colors: T.topOf(taste, 'colors', 3),
      fits: T.topOf(taste, 'fits', 2),
      patterns: T.topOf(taste, 'patterns', 2),
      negatives: {
        style: T.negatives(taste, 'style'), colors: T.negatives(taste, 'colors'),
        fits: T.negatives(taste, 'fits'), patterns: T.negatives(taste, 'patterns')
      },
      level: T.level(taste),
      summary: T.summarize(taste, U.profile)
    },
    wardrobe: summarizeWardrobe(U),
    recent_searches: (U.searches || []).slice(0, 5).map((s) => s.q),
    recent_signals: summarizeEvents(U),
    session: (U.session && U.session[opts.cid]) || null,
    season: R.currentSeason()
  };
  return ctx;
}
/* Размер под категорию из профиля/мерок. Числа пользователя — приоритет (§5). */
function sizeFor(profile, cat) {
  profile = profile || {};
  if (cat === 'shoes') return String(profile.shoeSize || '');
  if (cat === 'bottom') return String(profile.pantsSize || '');
  return String(profile.topSize || '');
}
/* Базовый (детерминированный) SearchIntent: работает и без AI-ключа. */
function baseIntent(message, U) {
  const parsed = R.nlParse(message || '');
  const profile = U.profile || {};
  const taste = U.taste || T.blankTaste();
  const neg = {
    style: T.negatives(taste, 'style'), colors: T.negatives(taste, 'colors'),
    fits: T.negatives(taste, 'fits'), patterns: T.negatives(taste, 'patterns')
  };
  const like = (arr, dim, extra) => {
    const t = T.topOf(taste, dim, 3).map((x) => x.key).filter((k) => !(neg[dim] || []).includes(k));
    (extra || []).forEach((k) => { if (k && !t.includes(k) && !(neg[dim] || []).includes(k)) t.unshift(k); });
    return t.slice(0, 3);
  };
  const cat = parsed.category || '';
  const hard = {
    category: cat,
    subcategory: parsed.subcategory || '',
    gender: profile.gender || '',
    size: parsed.size || sizeFor(profile, cat),
    maxPrice: parsed.maxPrice || (profile.budget ? Number(profile.budget) : null)
  };
  const soft = {
    colors: like([], 'colors', (profile.colors || []).concat(parsed.color ? [parsed.color] : [])),
    styles: like([], 'style', (profile.styles || []).concat(parsed.style ? [parsed.style] : [])),
    fits: like([], 'fits', []),
    patterns: [],
    occasion: parsed.occasion || '',
    avoid: [].concat(neg.colors || []).concat(neg.patterns || []).slice(0, 4)
  };
  const bits = [];
  if (profile.gender === 'female') bits.push('женская'); else if (profile.gender === 'male') bits.push('мужская');
  const catRu = { top: 'верх', bottom: 'низ', shoes: 'обувь', acc: 'аксессуар' }[cat] || 'одежда';
  const qcat = parsed.subcategory ? parsed.subcategory : catRu;
  const exact = [bits[0] || '', qcat, soft.colors[0] || '', hard.size ? 'размер ' + hard.size : '', soft.styles[0] || ''].filter(Boolean).join(' ');
  const normal = [qcat, soft.colors.slice(0, 2).join(' '), soft.styles[0] || ''].filter((x) => String(x).trim()).join(' ').trim() || (message || '').slice(0, 80);
  return {
    hard, soft,
    queries: { exact, normal, semantic: message || '' },
    message: humanIntent(message, hard, soft),
    relaxed: []
  };
}
function humanIntent(message, hard, soft) {
  const parts = [];
  if (hard.subcategory) parts.push(hard.subcategory);
  else if (hard.category) parts.push({ top: 'верх', bottom: 'низ', shoes: 'обувь', acc: 'аксессуар' }[hard.category] || 'вещь');
  if (hard.size) parts.push('размер ' + hard.size);
  if (soft.colors.length) parts.push('цвета: ' + soft.colors.join(', '));
  if (soft.styles.length) parts.push('стиль: ' + soft.styles.join(', '));
  if (soft.fits.length) parts.push('посадка: ' + soft.fits.join(', '));
  if (hard.maxPrice) parts.push('до ' + Number(hard.maxPrice).toLocaleString('ru-RU') + ' ₽');
  if (soft.occasion) parts.push('повод: ' + soft.occasion);
  return `Ищу: ${parts.join(' · ') || (message || 'подборку')}. Учитываю твой вкус, гардероб и бюджет.`;
}
/* Smart relaxation (§18): ступени ослабления soft; бюджет — только с allow. */
function relaxSteps() {
  return [
    { key: 'color2', note: 'убрал второй цвет' },
    { key: 'color', note: 'расширил цвета' },
    { key: 'fit', note: 'расширил посадку' },
    { key: 'style', note: 'расширил стиль' },
    { key: 'budget', note: 'приподнял бюджет ×1.25' }
  ];
}
function applyRelax(intent, applied) {
  const soft = JSON.parse(JSON.stringify(intent.soft));
  const hard = Object.assign({}, intent.hard);
  (applied || []).forEach((k) => {
    if (k === 'color2') soft.colors = soft.colors.slice(0, 1);
    if (k === 'color') soft.colors = [];
    if (k === 'fit') soft.fits = [];
    if (k === 'style') soft.styles = [];
    if (k === 'budget' && hard.maxPrice) hard.maxPrice = Math.round(hard.maxPrice * 1.25);
  });
  return { hard, soft };
}
module.exports = { buildUserContext, baseIntent, sizeFor, relaxSteps, applyRelax, summarizeWardrobe };
