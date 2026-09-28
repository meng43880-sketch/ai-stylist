'use strict';
/* recommend.js — детерминированный Recommendation Engine (8 факторов).
   AI НЕ придумывает итоговый процент: его считает код. Веса — из SCORE_WEIGHTS. */
const { CFG } = require('./config');
const STYLE_RU = { casual: 'Повседневный', smart: 'Smart casual', street: 'Streetwear', minimal: 'Минимализм', sport: 'Sport', oldmoney: 'Old money', business: 'Business casual', classic: 'Classic', tech: 'Techwear', oversize: 'Oversize', party: 'На выход' };
const COLOR_RU = { black: 'Чёрный', white: 'Белый', olive: 'Оливковый', beige: 'Бежевый', gray: 'Серый', green: 'Тёмно-зелёный', blue: 'Синий', brown: 'Коричневый' };
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
function fitScore(fit, build) {
  const t = {
    athletic: { regular: 95, straight: 95, relaxed: 90, slim: 70 },
    slim: { regular: 90, straight: 88, slim: 92, relaxed: 75 },
    plus: { relaxed: 95, straight: 90, regular: 80, slim: 45 },
    average: { regular: 92, straight: 90, relaxed: 85, slim: 72 }
  };
  return (t[build] && t[build][fit]) || 80;
}
function currentSeason(d) {
  const m = (d || new Date()).getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}
function normTitle(t) { return String(t).toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim(); }
/* ctx: {profile, feedback{styleW,colorW,likes,dislikes}, season, occasion, analyses{id:analysis}} */
function scoreProduct(p, ctx) {
  const profile = ctx.profile || {};
  const fb = Object.assign({ styleW: {}, colorW: {}, likes: {}, dislikes: {} }, ctx.feedback || {});
  const W = (ctx.weights) || CFG.weights;
  const pStyles = profile.styles || [];
  const hit = p.styles.filter((s) => pStyles.includes(s)).length;
  let style = pStyles.length ? 55 + Math.round(45 * (hit / Math.max(1, Math.min(2, pStyles.length)))) : 70;
  p.styles.forEach((s) => { style += (fb.styleW[s] || 0); });
  const pColors = profile.colors || [];
  const chit = p.colors.filter((c) => pColors.includes(c)).length;
  let color = pColors.length ? (chit > 0 ? 88 + Math.min(10, chit * 5) : 58) : 70;
  p.colors.forEach((c) => { color += (fb.colorW[c] || 0); });
  const body = fitScore(p.fit, profile.build);
  const need = p.cat === 'shoes' ? String(profile.shoeSize || '') : p.cat === 'bottom' ? String(profile.pantsSize || '') : String(profile.topSize || '');
  const size = (p.sizes.includes(need) || p.sizes.includes('One')) ? 100 : 42;
  const b = Number(profile.budget) || 5000;
  const budget = p.price <= b ? 100 : p.price <= b * 1.25 ? 68 : 40;
  let pref = 72;
  if (fb.likes && fb.likes[p.id]) pref = 100;
  if (fb.dislikes && fb.dislikes[p.id]) pref = 30;
  /* wardrobe affinity: вещи, похожие на то, что уже есть и нравится, — выше.
     Считаем кодом: за каждый общий стиль +3, за общий цвет +2 (макс. +10). */
  const wr = ctx.wardrobe || [];
  if (wr.length && !(fb.dislikes && fb.dislikes[p.id])) {
    let aff = 0;
    wr.forEach((w) => {
      const ss = (w.styles || []).filter((s) => p.styles.includes(s)).length;
      const cc = (w.colors || []).filter((c) => p.colors.includes(c)).length;
      aff += ss * 3 + cc * 2;
    });
    pref += Math.min(10, aff);
  }
  const an = ctx.analyses && ctx.analyses[p.id];
  const quality = an ? clamp((an.quality_signals.material + an.quality_signals.reviews) / 2)
    : (p.rating ? clamp((p.rating / 5) * 100 - 3) : 70);
  const seasonNow = ctx.season || currentSeason();
  let season = 75;
  if (p.seasons && p.seasons.includes(seasonNow)) season = 92;
  else if (p.seasons) season = 55;
  const occ = ctx.occasion || '';
  if (occ === 'date' || occ === 'party') season += p.styles.includes('party') || p.styles.includes('smart') ? 5 : -5;
  if (occ === 'sport') season += p.styles.includes('sport') ? 6 : -4;
  season = clamp(season);
  const parts = { style: clamp(style), color: clamp(color), body, size, budget, pref: clamp(pref), quality, season };
  const score = clamp(parts.style * W.style + parts.color * W.color + parts.body * W.body + parts.size * W.size + parts.budget * W.budget + parts.pref * W.pref + parts.quality * W.quality + parts.season * W.season);
  return { score: Math.max(58, Math.min(98, score)), parts };
}
function rankProducts(products, ctx) {
  const seen = new Set();
  const out = [];
  products.forEach((p) => {
    const k = normTitle(p.title) + '|' + p.cat;
    if (seen.has(k)) return; // dedup
    seen.add(k);
    const r = scoreProduct(p, ctx);
    out.push(Object.assign({}, p, { aiScore: r.score, aiParts: r.parts }));
  });
  return out.sort((a, b) => b.aiScore - a.aiScore);
}
function buildOutfits(ranked, profile, count) {
  const pick = (c) => ranked.filter((p) => p.cat === c);
  const tops = pick('top'), bottoms = pick('bottom'), shoes = pick('shoes'), accs = pick('acc');
  const out = []; const n = Math.min(count || 3, 4);
  for (let i = 0; i < n; i++) {
    const t = tops[i % Math.max(1, tops.length)], b = bottoms[i % Math.max(1, bottoms.length)], sh = shoes[i % Math.max(1, shoes.length)], a = accs[(i + 1) % Math.max(1, accs.length)];
    if (!t || !b || !sh) break;
    const items = [t, b, sh].concat(a && i % 2 === 0 ? [a] : []);
    const total = items.reduce((s, x) => s + x.price, 0);
    const score = Math.round(items.reduce((s, x) => s + x.aiScore, 0) / items.length);
    out.push({ id: 'auto' + i, name: i === 0 ? `Минималистичный ${(profile.styles || []).map((s) => STYLE_RU[s])[0] || 'базовый'}` : `${STYLE_RU[t.styles[0]] || 'Базовый'} образ №${i + 1}`, items: items.map((x) => x.id), total, score });
  }
  return out;
}
/* Controlled diversity: топ + новое + похожее на лайки + exploration. */
function feedMix(ranked, feedback, daySeed) {
  const liked = Object.keys((feedback && feedback.likes) || {});
  const likedStyles = new Set();
  ranked.filter((p) => liked.includes(p.id)).forEach((p) => p.styles.forEach((s) => likedStyles.add(s)));
  const top = ranked.slice(0, 4);
  const topIds = new Set(top.map((p) => p.id));
  const rest = ranked.filter((p) => !topIds.has(p.id));
  const similar = rest.filter((p) => p.styles.some((s) => likedStyles.has(s))).slice(0, 4);
  const simIds = new Set(similar.map((p) => p.id));
  const pool = rest.filter((p) => !simIds.has(p.id));
  const rot = daySeed % Math.max(1, pool.length);
  const fresh = pool.slice(rot).concat(pool.slice(0, rot)).slice(0, 4);
  const freshIds = new Set(fresh.map((p) => p.id));
  const explore = pool.filter((p) => !freshIds.has(p.id)).slice(-2);
  return { top, similar, fresh, explore };
}
/* Wardrobe insights — что AI понял о вкусе по имеющимся вещам.
   Считается кодом: палитра, стили, пробелы в гардеробе. */
const CATS_RU_W = { top: 'верха', bottom: 'низа', shoes: 'обуви', acc: 'аксессуаров' };
function wardrobeInsights(items) {
  const list = items || [];
  const colorCount = {}, styleCount = {}, catCount = { top: 0, bottom: 0, shoes: 0, acc: 0 };
  list.forEach((w) => {
    (w.colors || []).forEach((c) => { colorCount[c] = (colorCount[c] || 0) + 1; });
    (w.styles || []).forEach((s) => { styleCount[s] = (styleCount[s] || 0) + 1; });
    if (catCount[w.cat] !== undefined) catCount[w.cat]++;
  });
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const colors = top(colorCount, 3), styles = top(styleCount, 3);
  const gaps = Object.keys(catCount).filter((c) => !catCount[c]);
  let note;
  if (!list.length) note = 'Гардероб пока пуст. Добавь пару любимых вещей — и подборки станут точнее.';
  else {
    const parts = [];
    if (colors.length) parts.push('твои цвета — ' + colors.map((c) => (COLOR_RU[c] || c).toLowerCase()).join(', '));
    if (styles.length) parts.push('ближе всего ' + styles.map((s) => STYLE_RU[s] || s).join(' и '));
    if (gaps.length) parts.push('не хватает: ' + gaps.map((g) => CATS_RU_W[g]).join(', ') + ' — предложим это в первую очередь');
    note = 'Вижу ' + list.length + ' ' + plural(list.length, 'вещь', 'вещи', 'вещей') + ': ' + parts.join('; ') + '.';
  }
  return { count: list.length, colors, styles, gaps, catCount, note };
}
function plural(n, a, b, c) { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return b; return c; }
function nlParse(q) {  const s = (q || '').toLowerCase();
  const res = { category: '', color: '', maxPrice: null, style: '', occasion: '', size: '' };
  [['чёрн', 'black'], ['черн', 'black'], ['бел', 'white'], ['олив', 'olive'], ['беж', 'beige'], ['сер', 'gray'], ['зелён', 'green'], ['зелен', 'green'], ['син', 'blue'], ['голуб', 'blue'], ['коричн', 'brown']]
    .forEach(([k, v]) => { if (s.includes(k)) res.color = v; });
  [['худи', 'top'], ['толстов', 'top'], ['футбол', 'top'], ['рубаш', 'top'], ['куртк', 'top'], ['пальто', 'top'], ['бомбер', 'top'], ['свитшот', 'top'], ['лонгслив', 'top'], ['брюк', 'bottom'], ['джинс', 'bottom'], ['чинос', 'bottom'], ['карго', 'bottom'], ['кроссов', 'shoes'], ['кед', 'shoes'], ['ботин', 'shoes'], ['челси', 'shoes'], ['рюкзак', 'acc'], ['часы', 'acc'], ['кепк', 'acc'], ['очк', 'acc']]
    .forEach(([k, v]) => { if (s.includes(k)) res.category = v; });
  const m = s.replace(/\s/g, '').match(/до(\d+)/) || s.match(/(\d+)\s*(₽|руб|р\b|тыс)/);
  if (m) { let v = parseInt(m[1], 10); if (s.includes('тыс')) v *= 1000; res.maxPrice = v; }
  if (s.includes('old money') || s.includes('олд')) res.style = 'oldmoney';
  else if (s.includes('минимал')) res.style = 'minimal';
  else if (s.includes('street') || s.includes('стрит')) res.style = 'street';
  else if (s.includes('спорт')) res.style = 'sport';
  else if (s.includes('smart') || s.includes('смарт')) res.style = 'smart';
  else if (s.includes('бизнес')) res.style = 'business';
  if (s.includes('осен')) res.occasion = 'autumn';
  if (s.includes('свидан') || s.includes('день рождения')) res.occasion = 'date';
  if (s.includes('школ')) res.occasion = 'school';
  const sm = s.match(/размер(?:а|у)?\s*([a-z0-9]+)/) || s.match(/\b(xs|s|m|l|xl|xxl|3[0-9]|4[0-5])\b/);
  if (sm) res.size = sm[1].toUpperCase();
  return res;
}
function explain(p, profile, analysis) {
  const r = p.aiParts;
  const need = p.cat === 'shoes' ? profile.shoeSize : p.cat === 'bottom' ? profile.pantsSize : profile.topSize;
  const sizeOk = p.sizes.includes(String(need)) || p.sizes.includes('One');
  const an = analysis || null;
  const qualityNote = an
    ? `Оценка основана на составе (${an.material}) и повторяющихся сигналах из отзывов.`
    : (p.reviews ? 'Недостаточно данных для уверенной оценки качества — используем рейтинг карточки.' : 'Недостаточно данных для уверенной оценки качества.');
  return {
    score: p.aiScore,
    factors: [
      { key: 'style', title: 'Стиль', value: r.style, text: `Соответствует твоему профилю ${(profile.styles || []).map((s) => STYLE_RU[s]).join(' · ') || 'базовый'}.` },
      { key: 'body', title: 'Посадка', value: r.body, text: `Фасон «${p.fit}» визуально может подойти под указанные пропорции.` },
      { key: 'budget', title: 'Цена', value: r.budget, text: p.price <= profile.budget ? 'Укладывается в установленный бюджет.' : 'Выше бюджета, но посадка и стиль оценены высоко.' },
      { key: 'quality', title: 'Качество', value: r.quality, text: qualityNote },
      { key: 'size', title: 'Размер', value: r.size, text: sizeOk ? `Размер ${need} доступен — AI считает его рекомендуемым вариантом.` : `Размера ${need} нет — оценка снижена.` }
    ],
    reviewSummary: an ? an.review_summary : null
  };
}
module.exports = { STYLE_RU, COLOR_RU, scoreProduct, rankProducts, buildOutfits, feedMix, nlParse, explain, currentSeason, fitScore, wardrobeInsights };
