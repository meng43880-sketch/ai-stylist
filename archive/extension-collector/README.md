# Community Extension — отложенная идея (изоляция)

Сбор собственной базы товаров пользователями: расширение для Chrome/Edge
(кнопка «Сохранить в базу» на карточках WB/Ozon + автопилот выдачи) и
серверный приёмник (`POST /api/collect`, таблица `community`, слияние
в общую воронку).

## Почему отложено

Решение владельца: идея заморожена, основной продукт — без неё.

## Что лежит рядом

- `extension/` — полное рабочее расширение (manifest, парсеры WB/Ozon,
  popup со входом, автопилот с паузами и стопом по капче). README внутри.
- `backend-snapshot/` — рабочие копии backend-файлов С community-кодом
  на момент изоляции (market.js, orchestrator.js, server.js, store.js,
  auth.js). Можно diff-нуть с текущими, чтобы увидеть ровно community-куски.

## Как вернуть (когда понадобится)

1. Вернуть `extension/` в корень (или оставить тут — путь не важен).
2. Из `backend-snapshot/` перенести обратно:
   - `market.js`: `collectItem`, `searchCommunity`, `COMMUNITY_*`, ветка
     community-first в `MarketplaceService.getProduct`, exports;
   - `orchestrator.js`: блок слияния community в `searchPipeline`;
   - `server.js`: роуты `/api/collect`, `/api/collect/search`
     (+ `/api/admin/trust` для флага trusted);
   - `store.js`: `community` в blank(), таблицу, загрузку, flush;
   - `auth.js`: `trusted: false` при регистрации;
   - `.env`: `ADMIN_TOKEN` (+ `AFFILIATE_*` — это отдельная идея, живёт в основе).
3. Перезапустить backend, проверить `POST /api/collect`.

Данные: таблица `community` в PG остаётся сиротой (код её не трогает) —
при возврате всё подхватится само.
