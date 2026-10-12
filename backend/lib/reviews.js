'use strict';
/* reviews.js — разбор отзывов. Всё, что можно посчитать, считает КОД:
   средняя по оценённым, доли, темы (размер/ткань/швы/цвет), вердикт по размеру.
   Модель пишет только одно предложение-вердикт по найденным темам и цитатам.
   Отзыв без распознанной оценки НЕ считается отрицательным (баг v1: rating||0). */
const { CFG } = require('./config');
const Q = require('./qwen');
const P = require('./persona');

const AI_BLOCK = /нейросет|искусственн(ый|ого) интеллект|по мнению покупател|отзывы в двух словах|краткое содержание отзыв|сводк[аи] отзыв/i;
const THEMES = [
  { key: 'small', label: 'маломерит', kind: 'neg', re: /маломер|маленьк|мелковат|тесноват|тесн|на размер меньш|размер меньш|не налез|не влез|мал[аоы]?(?![а-я])/i },
  { key: 'big', label: 'большемерит', kind: 'neg', re: /большемер|великоват|велик[аоий]?(?![а-я])|на размер больш|размер больш|огромн|болтается/i },
  { key: 'thin', label: 'тонкая ткань', kind: 'neg', re: /тонк|просвечив|прозрачн|не плотн|жиденьк|синтетик|как полиэтилен|скользк/i },
  { key: 'seams', label: 'швы и нитки', kind: 'neg', re: /шов|нитк|торчат|кривой|кривые|брак|дыр[аыку]|порва|распор|строчк/i },
  { key: 'color', label: 'цвет не как на фото', kind: 'neg', noNeg: true, re: /цвет (не |другой|отличается)|не соответствует (фото|цвет|описан)|не как на фото|другого цвета|оттенок отличается/i },
  { key: 'shrink', label: 'садится после стирки', kind: 'neg', re: /села|сели после|усадк|садится|сел[аи] при стирк/i },
  { key: 'smell', label: 'запах', kind: 'neg', re: /запах|воняет|пахнет/i },
  { key: 'goodq', label: 'хорошее качество', kind: 'pos', re: /качествен|хорошее качество|отличн(ое|ая|ый) качеств|плотн(ая|ый|ое)|приятн(ая|ый|ое)|мягк/i },
  { key: 'ok', label: 'сидит в размер', kind: 'pos', noNeg: true, re: /в размер|по размеру|подош[её]л|подошла|идеально сидит|сидит идеально|как влитая|соответствует размер/i }
];
function matches(text, th) {
  const src = th.noNeg ? th.re : new RegExp('(?<!не\\s)(?:' + th.re.source + ')', 'i');
  return src.test(text);
}
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; if (m === 1 && h !== 11) return a; if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return b; return c; };

/* Чистая функция: считает статистику. Тестируется без сети. */
function analyze(reviews) {
  const list = (reviews || []).filter((r) => r && typeof r.text === 'string' && r.text.trim().length >= 10 && !AI_BLOCK.test(r.text))
    .map((r) => ({ text: r.text.trim(), rating: Math.max(0, Math.min(5, parseInt(r.rating, 10) || 0)) }));
  const rated = list.filter((r) => r.rating >= 1);
  const avg = rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : null;
  const pos = rated.filter((r) => r.rating >= 4).length;
  const neg = rated.filter((r) => r.rating <= 2).length;
  const counts = {};
  THEMES.forEach((t) => { counts[t.key] = 0; });
  list.forEach((r) => THEMES.forEach((t) => { if (matches(r.text, t)) counts[t.key]++; }));
  const size = { small: counts.small, ok: counts.ok, big: counts.big, label: 'нет данных' };
  const m = Math.max(size.small, size.ok, size.big);
  if (m > 0) {
    const top = ['small', 'ok', 'big'].filter((k) => size[k] === m);
    size.label = top.length > 1 ? 'по-разному' : ({ small: 'маломерит', ok: 'в размер', big: 'большемерит' })[top[0]];
  }
  const themes = THEMES.filter((t) => counts[t.key] > 0 && !['small', 'big', 'ok'].includes(t.key))
    .map((t) => ({ key: t.key, label: t.label, kind: t.kind, count: counts[t.key] })).sort((a, b) => b.count - a.count);
  return { list, count: list.length, rated: rated.length, avg, pos, neg, counts, size, themes };
}
function pickQuotes(a) {
  const negIdx = a.list.filter((r) => r.rating >= 1 && r.rating <= 3).slice(0, 4);
  const posIdx = a.list.filter((r) => r.rating >= 4).slice(0, 3);
  const unrated = a.list.filter((r) => r.rating === 0).slice(0, 5);
  return negIdx.concat(posIdx).concat(negIdx.length + posIdx.length < 5 ? unrated : []).slice(0, 8).map((r) => r.text.slice(0, 140));
}
function templateVerdict(a) {
  if (!a.count) return null;
  const neg = a.themes.filter((t) => t.kind === 'neg').slice(0, 2).map((t) => `${t.label} (${t.count})`);
  const pos = a.themes.filter((t) => t.kind === 'pos').slice(0, 1).map((t) => `${t.label} (${t.count})`);
  const bits = [`По ${a.count} ${plural(a.count, 'отзыву', 'отзывам', 'отзывам')}`];
  if (a.avg != null) bits[0] += `, средняя ${String(a.avg).replace('.', ',')}`;
  let s = bits[0] + '.';
  if (a.size.label !== 'нет данных') s += ` Размер: ${a.size.label}.`;
  if (neg.length) s += ` Ругают: ${neg.join(', ')}.`;
  if (pos.length) s += ` Хвалят: ${pos.join(', ')}.`;
  if (a.avg == null) s += ' Оценки не распознаны.';
  return s;
}
async function reviewComment(productId, reviews) {
  const a = analyze(reviews);
  const base = {
    productId, count: a.count, rated: a.rated, avg: a.avg, pos: a.pos, neg: a.neg, size: a.size,
    themes: a.themes.slice(0, 5),
    pros: a.themes.filter((t) => t.kind === 'pos').slice(0, 3).map((t) => t.label),
    cons: a.themes.filter((t) => t.kind === 'neg').slice(0, 3).map((t) => t.label)
  };
  if (!a.count) return Object.assign(base, { source: 'signals', comment: null });
  let verdict = null, source = 'signals';
  if (Q.isConfigured(CFG.qwen.product)) {
    try {
      const msg = await Q.chatComplete(CFG.qwen.product, {
        messages: [
          { role: 'system', content: [{ type: 'text', text: 'Ты читаешь отзывы покупателей с маркетплейса. Напиши ОДНО предложение-вердикт по-русски, до 16 слов: что чаще хвалят и на что чаще жалуются. Используй ТОЛЬКО переданные темы и цитаты, ничего не придумывай, числа не пиши, без рекламного тона. Ответ строго JSON: {"verdict":""}' }] },
          { role: 'user', content: [{ type: 'text', text: JSON.stringify({ size: a.size.label, themes: a.themes.slice(0, 5).map((t) => ({ тема: t.label, отзывов: t.count })), quotes: pickQuotes(a) }) }] }
        ], tag: 'product', maxTokens: 120, temperature: 0.1
      });
      const o = P.extractJSON(msg.content || '');
      const v = typeof o.verdict === 'string' ? o.verdict.trim() : '';
      if (v.length >= 10 && v.length <= 180 && P.cyrRatio(v) >= 0.8 && !/\d/.test(v)) { verdict = v; source = 'qwen-product'; }
    } catch (e) { /* AI недоступен — вернём шаблон из кода */ }
  }
  const stats = templateVerdict(a);
  /* Итог: короткая строка с числами из кода + вердикт модели, если он прошёл проверку. */
  const comment = verdict ? verdict + ' ' + (a.size.label !== 'нет данных' ? 'Размер: ' + a.size.label + '.' : '') : stats;
  return Object.assign(base, { source, comment: String(comment).trim().slice(0, 260), stats });
}
module.exports = { reviewComment, analyze, templateVerdict, THEMES };
