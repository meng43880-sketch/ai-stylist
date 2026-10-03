# sainvio — персональный подбор одежды

> Frontend v3 (минимализм): главная = встроенный AI-чат + лента. Ответы AI со
> вещами/образами одной кнопкой уходят в ленту. Каталог и скоринг — backend.

Mobile-first sainvio: фото → анализ → профиль → персональная лента → образы → магазин.
Без ключей работает **демо-режим** (DemoAI + демо-каталог). С ключами в backend `.env` —
**production AI-режим** (Qwen Vision / Stylist / Product). Ключи во frontend отсутствуют.

## Структура

```text
/ (project root = frontend)
  index.html, styles.css, app.js, demo.js   # frontend, чистый HTML/CSS/JS
  .env.example, README.md, MARKETPLACE_INTEGRATION.md
  /archive  # отложенные идеи (не подключено к приложению)
  Dockerfile, render.yaml, .dockerignore, .gitignore
/backend
  package.json, server.js          # HTTP API, Node 18+ (pg — только для PG-режима)
  /lib  config, store, qwen, catalog, recommend, orchestrator,
        market, datasets, auth     # market/datasets/auth — маркетплейсы, данные, вход
  /data db.json                    # только без DATABASE_URL (dev-режим)
```

## Запуск frontend

Вариант A (рекомендуется) — через backend, тогда доступен `/api`:

```bash
cd backend
npm start
# → http://127.0.0.1:8001
```

Вариант B — любой статический сервер из корня (демо-режим, без AI API):

```bash
python -m http.server 8000
# → http://127.0.0.1:8000
```

## Запуск backend

```bash
cd backend
cp ../.env.example .env   # пример в корне, сам файл — backend/.env (в git не идёт)
npm install            # нужен только для PG-режима (пакет pg)
npm start
```

## База данных: Postgres (чтобы аккаунты переживали редеплой)

Локально без настроек работает файл `backend/data/db.json`. Для продакшена
нужен Postgres — бесплатно и без карты, за 5 минут, на **Neon** (neon.tech):

1. Sign up → New Project (Postgres 16, регион поближе) → Create
2. Скопируй **Connection string** (начинается с `postgresql://...`)
3. Render → твой сервис → Environment → добавь `DATABASE_URL` = эта строка
4. Render сам перезапустит сервис. Проверка: `GET /api/status` отвечает,
   регистрация работает, повторный деплой ничего не стирает

Как это устроено: те же пользователи/сессии/профили/гардероб/кеш лежат в
таблицах `users, sessions, user_data, cache, usage` (создаются сами при
старте). Код выше не менялся — `store.js` держит in-memory зеркало и
дописывает изменения отложенным flush. Без `DATABASE_URL` всё как раньше.

## Деплой в интернет (полная версия с backend)

Бесплатно, без карты — **Render** (в репо уже лежит `render.yaml` + `Dockerfile`):

1. Зайди на **dashboard.render.com** через GitHub
2. **New → Web Service** → выбери `sainvio`
3. Runtime: **Docker** (подхватится сам), план **Free**
4. В **Environment** Render попросит только секрет (остальное уже в `render.yaml`):
   `ZVENO_API_KEY` = твой ключ
5. **Deploy** → через несколько минут получишь URL вида `https://xxx.onrender.com`

Нюансы: на Free-тарифе сервис засыпает после ~15 минут простоя — первый
запрос будит его ~30–60 секунд (потом летает). Диск эфемерный: профили
и гардероб сбросятся при редеплое — для теста ок. Локальный backend при
этом можно остановить.

Запасной вариант — **Glitch** (тоже бесплатно, импорт из GitHub, засыпает
через 5 минут простоя).

Backend читает env из процесса. Проще всего держать `.env` в корне проекта и
стартовать так (PowerShell): `Get-Content ..\.env | ...` — либо скопировать `.env`
в `backend/.env` и использовать `node --env-file=.env server.js` (Node 20.6+).
Без `.env` используются дефолты: порт 8001, `DATA_SOURCE=demo`, демо-режим AI.

## Environment variables

| Переменная | Назначение |
|---|---|
| `QWEN_VISION_API_KEY/BASE_URL/MODEL` | Vision AI (анализ фото; по умолчанию `qwen3-vl-plus`) |
| `QWEN_STYLIST_API_KEY/BASE_URL/MODEL` | Main Stylist AI (диалог, решения; по умолчанию `qwen3-32b`) |
| `QWEN_PRODUCT_API_KEY/BASE_URL/MODEL` | Product AI (разбор товаров/отзывов; по умолчанию `qwen3-8b`) |
| `DATA_SOURCE` | `demo` (демо-каталог) / `production` (реальные провайдеры) |
| `WILDBERRIES_API_KEY`, `OZON_API_KEY` | Будущие backend-proxy маркетплейсов |
| `WEATHER_LAT/LON/CITY` | Погода (Open-Meteo, ключ не нужен) |
| `SCORE_WEIGHTS` | JSON весов 8-факторного скоринга |
| `PORT`, `MAX_BODY_BYTES`, `MAX_IMAGE_BYTES`, `RATE_PER_MIN` | Лимиты и порт |

## Подключение Qwen

1. Вставь ключи в `.env` (только backend, никогда во frontend).
2. При необходимости смени `*_BASE_URL`/`*_MODEL` — модель задаётся только env.
3. Перезапусти backend. `GET /api/status` покажет `aiMode: production` и какие
   провайдеры сконфигурированы. Без ключей — `demo`, приложение не падает.

Ожидаемые модели: Vision — Qwen3-VL-совместимая (`qwen3-vl-plus`);
Stylist — Qwen3-32B-совместимая (`qwen3-32b`); Product — лёгкая (`qwen3-8b`).
Все через OpenAI-совместимый `/chat/completions` + `response_format: json_object`.

## Подключение Wildberries / Ozon

**Wildberries — подключён по-настоящему** (без ключа, открытый поисковый API):

- `backend/lib/market.js` — `wbSearchServer()` ходит в `search.wb.ru`, маппит
  ответ в нашу схему товара (реальные название, цена, фото, рейтинг, цвета,
  размеры, ссылка на карточку). Живые товары помечены `live:true`
- `GET /api/market/wb/search?q=&limit=` — серверный поиск (с кешем 10 минут)
- `POST /api/market/score` — скоринг живых товаров тем же движком (профиль + вкус + гардероб)
- Frontend `WBClient` дублирует поиск **прямо из браузера пользователя** (у WB
  открытый CORS) — работает, даже если сеть сервера режет WB
- `DATA_SOURCE=hybrid` — backend сам подмешивает живьё в `/api/recommendations`
- Живое помечается в UI зелёной меткой Live; отзывам живых товаров мы не
  выдумываем — они смотрятся на странице магазина

**Ozon — честное ограничение.** Открытого товарного API нет, витрина за
антиботом (403). `GET /api/market/ozon/search` возвращает `503 NO_SOURCE`.
Для живых данных Ozon нужен официальный доступ:

1. Ozon Seller API (нужен кабинет продавца) — остатки/цены своих товаров
2. Ozon Partner (CPA-платформа, модерация) — товарные фиды и deeplink

Куда вставлять: `WILDBERRIES_API_KEY` не нужен; для Ozon — будущие
`OZON_CLIENT_ID / OZON_API_KEY` в `.env`, реализация — в `market.js`
`ozonSearchServer()` (интерфейс уже на месте). Кнопки «перейти в магазин»
уже ведут на живой поиск Ozon.

## Demo mode / Production mode

- Нет ключей → `aiMode: demo`: локальный DemoAI, детерминированный скоринг,
  демо-каталог и демо-отзывы. Всё работает офлайн (кроме фото из сети).
- Есть ключи → `aiMode: production`: фото уходит в Vision AI (уменьшенное до
  768px), чат ведёт Stylist AI с tools, товары разбирает Product AI с кешем
  (повторный анализ одного товара не вызывается). При ошибке AI — graceful
  fallback на демо с сообщением, приложение не падает.
- Dev-индикатор режима: открой приложение с `?dev=1`.

## Архитектура

```text
Frontend → /api/* → AIOrchestrator → Vision | Stylist | Product (Qwen)
                           ↓
            UserContext + SearchIntent (hard/soft, relaxation)
                           ↓
               Recommendation Engine (код, а не AI)
   style .25 · color .15 · body .15 · size .15 · budget .10 · pref .10
   quality .05 · season .05 · wardrobe .06 + redundancy-штраф
   вкусовые векторы подмешиваются в веса; веса — из SCORE_WEIGHTS
```

Cost control: 500 товаров → код-фильтры → кешированные анализы → скоринг →
топ-20 → Main AI только для финала/диалога. Фото анализируется один раз и
кешируется по хешу. Код считает: фильтры, сортировку, дедуп, score, историю,
кеш, пагинацию.

## Персональный стилист (taste + intent + обучение)

Запрос «футболка» превращается в SearchIntent: hard (категория/пол/размер/
бюджет) + soft (цвета/стили/посадки из вкуса) + 3 уровня запроса. Вкус —
векторы style/colors/fits/patterns со value/confidence/evidence, учатся
детерминированно на событиях (like/dislike/save/open/wardrobe/purchase),
явное важнее выведенного. Движок добавляет wardrobe-совместимость и
redundancy-штраф. Сводки для AI — только топы и саммари, не вся история.
События снимаются сервером с существующих роутов — frontend не менялся.
Тесты: `node backend/test/run.js` (24 проверки).

## Как заменить AI provider

Реализуй тот же интерфейс, что в `backend/lib/qwen.js`
(`chatJSON(provider, {system, user, images, required})`), положи рядом
`myprovider.js`, укажи его BASE_URL/MODEL в `.env`. Frontend не меняется.

## Как заменить Product provider

Реализуй `search(struct)/getById(id)` в `backend/lib/catalog.js`,
зарегистрируй в оркестраторе, поставь `DATA_SOURCE=production`. Frontend не меняется.

## Как перейти на собственный GPU

Self-hosted Qwen с OpenAI-совместимым сервером (vLLM/TGI): достаточно сменить
`*_BASE_URL` на адрес GPU и `*_MODEL` на локальную модель. Никаких изменений кода.

## API (кратко)

`GET /api/status|/api/context` · `POST /api/auth/register|/api/auth/login|/api/auth/logout` ·
`GET/PUT/DELETE /api/profile` · `POST /api/analyze-photo` ·
`POST /api/search|/api/recommendations` · `POST /api/outfits` ·
`GET /api/products/:id|/:id/reviews|/:id/analysis|/:id/explanation|/:id/availability` ·
`POST /api/product-analysis|/api/products/explanation` · `POST /api/ai/chat` ·
`POST /api/feedback` · `GET/POST /api/favorites` · `GET /api/history` ·
`GET/POST/DELETE /api/wardrobe` · `GET /api/market/wb/search|/api/market/ozon/search` ·
`POST /api/market/score` · `GET /api/market/link` ·
`POST /api/user/event` · `GET /api/user/context|/api/user/taste-profile` ·
`POST /api/ai/search-intent` · `POST /api/taste/recalculate` ·
`POST /api/user/wardrobe/analyze`
