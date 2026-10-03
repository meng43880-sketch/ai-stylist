'use strict';
/* Детерминированные тесты персонального стилиста (§53).
   Без сети и AI-ключей: чистая математика вкуса, интента, движка. */
process.chdir(__dirname + '/..');
const T = require('../lib/taste');
const R = require('../lib/recommend');
const CX = require('../lib/context');
const EV = require('../lib/events');
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function mkUser() {
  return {
    profile: { name: 'T', height: 180, weight: 80, gender: 'male', topSize: 'L', pantsSize: '32', shoeSize: '43', build: 'average', styles: ['minimal'], budget: 5000, colors: ['olive'] },
    vision: null, favorites: [], outfits: [], wardrobe: [],
    feedback: { likes: {}, dislikes: {}, styleW: {}, colorW: {} },
    history: [], chats: {}, taste: T.blankTaste(), events: [], searches: [], recs: [],
    measures: {}, session: {}
  };
}
const demoTee = (id, styles, colors, fit) => ({
  id, title: 'Tee ' + id, price: 2000, old: 2500, img: '', mp: 'WB', brand: 'B',
  cat: 'top', colors, sizes: ['M', 'L'], styles, fit: fit || 'regular',
  rating: 4.5, reviews: 100
});
(async () => {
  /* TEST1: «футболка» + профиль → подробный SearchIntent, не просто слово. */
  {
    const U = mkUser();
    const it = CX.baseIntent('футболка', U);
    ok(it.hard.gender === 'male', 'T1 gender hard');
    ok(it.hard.size === 'L', 'T1 size hard');
    ok(it.hard.maxPrice === 5000, 'T1 budget hard');
    ok(it.soft.colors.includes('olive'), 'T1 olive soft');
    ok(it.soft.styles.includes('minimal'), 'T1 minimal soft');
    ok(typeof it.queries.exact === 'string' && it.queries.exact.length > 5, 'T1 exact query');
    ok(typeof it.message === 'string' && it.message.length > 10, 'T1 human message');
  }
  /* TEST2: «на день рождения» → occasion в soft + outfit-намерение. */
  {
    const U = mkUser();
    const it = CX.baseIntent('хочу что-нибудь на день рождения', U);
    ok(it.soft.occasion === 'date', 'T2 occasion=date');
  }
  /* TEST3: «не хочу чёрное» → explicit negative. */
  {
    const U = mkUser();
    const r = await EV.logEvent(U, 'explicit', null, { dim: 'colors', key: 'black', like: false, why: 'user said' });
    ok(r.sigCount === 1, 'T3 explicit logged');
    ok(T.negatives(U.taste, 'colors').includes('black'), 'T3 black negative');
  }
  /* TEST4: 10 лайков minimal → minimal растёт, уверенность растёт. */
  {
    const U = mkUser();
    for (let i = 0; i < 10; i++) {
      const p = demoTee('t' + i, ['minimal', 'casual'], ['black'], 'regular');
      const C = require('../lib/catalog');
      C.PRODUCTS.push(p);
      await EV.logEvent(U, 'like', p.id, {});
    }
    const top = T.topOf(U.taste, 'style', 2);
    ok(top.length && top[0].key === 'minimal' && top[0].value > 0.6, 'T4 minimal up', JSON.stringify(top));
    ok(top[0].conf > 0.5, 'T4 conf grows');
    require('../lib/catalog').PRODUCTS.splice(-10);
  }
  /* TEST5: 10 дизлайков oversized → падает, не ноль сразу. */
  {
    const U = mkUser();
    for (let i = 0; i < 10; i++) {
      const C = require('../lib/catalog');
      const p = demoTee('o' + i, ['oversize', 'street'], ['black'], 'relaxed');
      C.PRODUCTS.push(p);
      await EV.logEvent(U, 'dislike', p.id, {});
    }
    const e = U.taste.style.oversize;
    ok(e && e.value < 0.4, 'T5 oversize down', JSON.stringify(e));
    ok(e && e.value > 0.02, 'T5 not zeroed');
    require('../lib/catalog').PRODUCTS.splice(-10);
  }
  /* TEST6: 5 вещей в гардеробе → compatibility у похожего выше. */
  {
    const U = mkUser();
    for (let i = 0; i < 5; i++) U.wardrobe.push({ id: 'w' + i, title: 'Tee', cat: 'top', colors: ['olive'], styles: ['minimal'] });
    const ctx = { profile: U.profile, feedback: U.feedback, wardrobe: U.wardrobe, season: 'autumn' };
    const same = R.scoreProduct(demoTee('s1', ['minimal'], ['olive']), ctx);
    const diff = R.scoreProduct(demoTee('s2', ['party'], ['brown']), ctx);
    ok(same.parts.wardrobe > diff.parts.wardrobe, 'T6 compat matters', `${same.parts.wardrobe} vs ${diff.parts.wardrobe}`);
  }
  /* TEST7: 5 одинаковых чёрных футболок → redundancy режет. */
  {
    const U = mkUser();
    for (let i = 0; i < 5; i++) U.wardrobe.push({ id: 'w' + i, title: 'Black tee', cat: 'top', colors: ['black'], styles: ['minimal', 'casual'] });
    const ctx = { profile: U.profile, feedback: U.feedback, wardrobe: U.wardrobe, season: 'autumn' };
    const dup = R.scoreProduct(demoTee('d1', ['minimal', 'casual'], ['black']), ctx);
    const fresh = R.scoreProduct(demoTee('d2', ['sport'], ['blue']), ctx);
    ok(dup.redund.score >= 0.6, 'T7 redundancy flagged', JSON.stringify(dup.redund));
    ok(fresh.redund.score < dup.redund.score, 'T7 fresh less redundant');
  }
  /* TEST8: плохой Vision-ответ → nulls, не выдумка, без падений. */
  {
    const O = require('../lib/orchestrator');
    void O;
    const norm = (() => {
      // normalizeVision не экспортирован — проверяем через taste-уровень: пустой ответ не должен ронять контекст
      const U = mkUser();
      U.vision = { source: 'demo' };
      const c = CX.buildUserContext(U, {});
      return c.visual && Array.isArray(c.visual.style_signals);
    })();
    ok(norm === true, 'T8 empty vision safe in context');
  }
  /* Guards: частичный товар не роняет скоринг; уровень/саммари считаются. */
  {
    const U = mkUser();
    const ctx = { profile: U.profile, feedback: U.feedback, wardrobe: [], season: 'autumn' };
    const r = R.scoreProduct({ id: 'x', title: 'X', price: 100 }, ctx);
    ok(Number.isFinite(r.score), 'G partial product safe');
    ok(T.level(U.taste) === 0, 'G level 0 fresh');
    ok(typeof T.summarize(U.taste, U.profile) === 'string', 'G summary string');
  }
  /* Relaxation: ступени ослабляют soft, hard цел. */
  {
    const U = mkUser();
    const it = CX.baseIntent('черная куртка до 3000', U);
    const r2 = CX.applyRelax(it, ['color', 'fit']);
    ok(r2.soft.colors.length === 0 && r2.soft.fits.length === 0, 'R soft relaxed');
    ok(r2.hard.maxPrice === 3000, 'R hard intact');
    const r3 = CX.applyRelax(it, ['budget']);
    ok(r3.hard.maxPrice === 3750, 'R budget x1.25');
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
