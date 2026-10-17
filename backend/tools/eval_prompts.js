'use strict';
/* Прогон набора запросов к стилисту: время, токены, intent, проверки качества.
   Офлайн (без сервера, проверяет разбор запросов):   node backend/tools/eval_prompts.js
   Онлайн (реальный сервер и AI):
     node backend/tools/eval_prompts.js --base http://localhost:3000 --login evaltest --password secret123 [--limit 10] [--out report.json]
   Для онлайна создаётся (или используется) тестовый аккаунт. Разговор в группе «A» идёт в одном диалоге. */
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => { if (x.startsWith('--')) a.push([x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return a; }, []));
const set = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'prompts_30.json'), 'utf8')).prompts;
const prompts = set.slice(0, Number(args.limit) || set.length);
const cyr = (s) => { const l = (String(s).match(/[A-Za-zА-Яа-яЁё]/g) || []); return l.length ? (String(s).match(/[А-Яа-яЁё]/g) || []).length / l.length : 1; };
const BAD = /как (ии|искусственный интеллект|языковая модель)|as an ai|i cannot|я не могу помочь с этим/i;

/* --- офлайн: разбор запроса кодом --- */
function offline() {
  const R = require(path.join(__dirname, '..', 'lib', 'recommend'));
  let ok = 0, bad = 0; const rows = [];
  prompts.forEach((p) => {
    const got = R.nlParse(p.q); const miss = [];
    Object.keys(p.expect).forEach((k) => { if (got[k] !== p.expect[k]) miss.push(`${k}: ждали ${JSON.stringify(p.expect[k])}, получили ${JSON.stringify(got[k])}`); });
    if (miss.length) bad++; else ok++;
    rows.push({ id: p.id, q: p.q, ok: !miss.length, miss });
  });
  rows.filter((r) => !r.ok).forEach((r) => console.log(`✗ #${r.id} «${r.q}» — ${r.miss.join('; ')}`));
  console.log(`\nОфлайн-разбор: ${ok} из ${ok + bad} ок`);
  return bad;
}

/* --- онлайн --- */
async function api(base, p, body, token) {
  const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); j._status = r.status; return j;
}
function tokensOf(diag) { /* diag.ai.usage в разных версиях выглядит по-разному — суммируем всё похожее на in/out */
  let t = 0; const walk = (o) => { if (o && typeof o === 'object') Object.keys(o).forEach((k) => { if (typeof o[k] === 'number' && /^(in|out|input|output|inputTokens|outputTokens)$/i.test(k)) t += o[k]; else walk(o[k]); }); };
  walk(diag && (diag.ai || diag.usage || diag)); return t;
}
async function online() {
  const base = String(args.base).replace(/\/+$/, ''), login = args.login || 'evaltest', password = args.password || 'evalpass123';
  let r = await api(base, '/api/auth/login', { login, password });
  if (!r.token) r = await api(base, '/api/auth/register', { login, password });
  if (!r.token) { console.error('Не удалось войти/зарегистрироваться:', r.error || r._status); process.exit(1); }
  const tk = r.token;
  await api(base, '/api/profile', { profile: { name: 'Тест', height: 180, weight: 75, gender: 'male', build: 'average', topSize: 'M', pantsSize: '32', shoeSize: '43', styles: ['minimal', 'casual'], budget: 5000, colors: ['black', 'olive'] } }, tk);
  const rows = []; const convs = {};
  for (const p of prompts) {
    const cid = p.group ? (convs[p.group] = convs[p.group] || 'eval' + Date.now() + p.group) : 'eval' + Date.now() + 'x' + p.id;
    const d0 = tokensOf(await api(base, '/api/diag')); const t0 = Date.now();
    const res = await api(base, '/api/ai/chat', { message: p.q, conversationId: cid }, tk);
    const ms = Date.now() - t0; const d1 = tokensOf(await api(base, '/api/diag'));
    const d = res.data || {}; const prods = d.products || []; const pickIds = (d.picks || []).map((x) => x.id);
    const checks = {
      ответ_получен: !!res.ok && !!d.message,
      русский_текст: !d.message || cyr(d.message) >= 0.8,
      длина_до_600: !d.message || d.message.length <= 600,
      без_фраз_про_ИИ: !BAD.test(d.message || ''),
      picks_из_найденных: pickIds.every((id) => prods.some((x) => x.id === id)),
      бюджет_соблюдён: !p.expect.maxPrice || prods.slice(0, 5).every((x) => x.price <= p.expect.maxPrice * 1.3),
      категория_верна: !p.expect.category || !prods.length || prods.slice(0, 5).filter((x) => x.cat === p.expect.category).length >= Math.min(3, prods.length)
    };
    const fails = Object.keys(checks).filter((k) => !checks[k]);
    rows.push({ id: p.id, q: p.q, ms, tokens: d1 && d0 ? Math.max(0, d1 - d0) : null, intent: d.intent || '', products: prods.length, picks: pickIds.length, msgLen: (d.message || '').length, model: d.model || '', fails });
    console.log(`${fails.length ? '✗' : '✓'} #${String(p.id).padStart(2)} ${String(ms).padStart(5)} мс  ${String(d.intent || '-').padEnd(14)} товаров ${String(prods.length).padStart(2)}  «${p.q}»${fails.length ? '  ← ' + fails.join(', ') : ''}`);
  }
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b), q = (x) => ms[Math.min(ms.length - 1, Math.floor(ms.length * x))];
  const sum = { всего: rows.length, ошибок_проверок: rows.filter((r) => r.fails.length).length, p50_мс: q(0.5), p90_мс: q(0.9), токенов_всего: rows.reduce((s, r) => s + (r.tokens || 0), 0) || 'нет данных в /api/diag' };
  console.log('\nИтог:', JSON.stringify(sum));
  if (args.out) { fs.writeFileSync(args.out, JSON.stringify({ at: new Date().toISOString(), base, summary: sum, rows }, null, 1)); console.log('Отчёт:', args.out); }
  return sum.ошибок_проверок;
}
(args.base ? online() : Promise.resolve(offline())).then((bad) => process.exit(bad ? 1 : 0)).catch((e) => { console.error(e); process.exit(2); });
