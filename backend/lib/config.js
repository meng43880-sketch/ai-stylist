'use strict';
/* Config: все секреты и настройки — только из environment. Frontend их не видит.
   Поддерживается backend/.env (и ../.env) — мини-лоадер без зависимостей. */
const fs = require('fs');
const path = require('path');
function loadEnv() {
  [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')].forEach((f) => {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      txt.split('\n').forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const i = t.indexOf('=');
        if (i < 0) return;
        const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        if (k && process.env[k] === undefined) process.env[k] = v;
      });
    } catch (e) { /* файла может не быть */ }
  });
}
loadEnv();
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
/* AI-провайдер: явный QWEN_*_KEY/BASE/MODEL, либо общий OFOX-шлюз,
   либо ZVENO (временно: одна модель на все три AI). Без ключей — демо. */
const ZVENO_KEY = process.env.ZVENO_API_KEY || '';
const ZVENO_BASE = (process.env.ZVENO_BASE_URL || 'https://api.zveno.ai/v1').replace(/\/$/, '');
const ZVENO_MODEL = process.env.ZVENO_MODEL || 'dots-studio/dots-3-note-preview:free';
const ZVENO_FALLBACKS = (process.env.ZVENO_FALLBACKS || 'nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free,inclusionai/ling-3.0-flash-sante:free').split(',').map((s) => s.trim()).filter(Boolean);
function qwenProvider(name, ofoxModel, dashBase, dashModel) {
  if (process.env['QWEN_' + name + '_API_KEY']) {
    return {
      key: process.env['QWEN_' + name + '_API_KEY'],
      base: (process.env['QWEN_' + name + '_BASE_URL'] || dashBase).replace(/\/$/, ''),
      model: process.env['QWEN_' + name + '_MODEL'] || dashModel
    };
  }
  if (process.env.OFOX_API_KEY) {
    const ofoxBase = (process.env.OFOX_BASE_URL || 'https://api.ofox.ai/v1').replace(/\/$/, '');
    return { key: process.env.OFOX_API_KEY, base: ofoxBase, model: process.env['QWEN_' + name + '_MODEL'] || ofoxModel };
  }
  if (ZVENO_KEY) {
    return { key: ZVENO_KEY, base: ZVENO_BASE, model: process.env['QWEN_' + name + '_MODEL'] || ZVENO_MODEL, fallbacks: ZVENO_FALLBACKS };
  }
  return { key: '', base: dashBase.replace(/\/$/, ''), model: dashModel };
}
function weights() {
  const d = { style: 0.25, color: 0.15, body: 0.15, size: 0.15, budget: 0.10, pref: 0.10, quality: 0.05, season: 0.05 };
  try {
    const o = JSON.parse(process.env.SCORE_WEIGHTS || '{}');
    const w = Object.assign({}, d, o);
    const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    Object.keys(w).forEach((k) => { w[k] = w[k] / sum; });
    return w;
  } catch { return d; }
}
const CFG = {
  port: num(process.env.PORT, 8001),
  nodeEnv: process.env.NODE_ENV || 'development',
  demoMode: (process.env.DEMO_MODE || '').toLowerCase() !== 'false' && !(process.env.QWEN_VISION_API_KEY || process.env.QWEN_STYLIST_API_KEY || process.env.QWEN_PRODUCT_API_KEY || process.env.OFOX_API_KEY || process.env.ZVENO_API_KEY),
  /* Демо-каталог выключен: никаких выдуманных товаров. Включить обратно: DEMO_CATALOG=true */
  demoCatalog: (process.env.DEMO_CATALOG || '').toLowerCase() === 'true',
  dataSource: (process.env.DATA_SOURCE || 'demo').toLowerCase(), // demo | hybrid
  weights: weights(),
  limits: { bodyBytes: num(process.env.MAX_BODY_BYTES, 1500000), imageBytes: num(process.env.MAX_IMAGE_BYTES, 4000000), ratePerMin: num(process.env.RATE_PER_MIN, 60) },
  weather: { lat: process.env.WEATHER_LAT || '55.75', lon: process.env.WEATHER_LON || '37.61', city: process.env.WEATHER_CITY || 'Москва' },
  qwen: {
    vision: qwenProvider('VISION', 'qwen/qwen3.8-flash', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'qwen3-vl-plus'),
    stylist: qwenProvider('STYLIST', 'qwen/qwen3.8-flash', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'qwen3-32b'),
    product: qwenProvider('PRODUCT', 'qwen/qwen-flash', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'qwen3-8b')
  },
  marketplaces: { wbKey: process.env.WILDBERRIES_API_KEY || '', ozonKey: process.env.OZON_API_KEY || '' }
};
CFG.aiMode = (CFG.qwen.vision.key || CFG.qwen.stylist.key || CFG.qwen.product.key) ? 'production' : 'demo';
module.exports = { CFG };
