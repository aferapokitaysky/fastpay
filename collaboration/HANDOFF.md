# Handoff — текущая рабочая база

## 2026-08-20 — Claude (B0 done)

- Added: `apps/api` (Fastify + TS) и `packages/contracts` (`@fastpay/contracts`) реализованы и запушены в `feat/api-platform-foundation` (6 коммитов, HEAD `c93072e`). Drizzle-схема (7 таблиц, только MVP-объём: organizations/venues/floors/tables/menu_items/orders/order_items), миграции в `apps/api/drizzle`, идемпотентный `db:seed` (demo-ресторан "Goodman Demo", печатает QR-токен в stdout), request-id + error-envelope middleware, `GET /health`, `GET /ready` (проверяет Postgres+Redis), `GET /v1/public/tables/:token/bill` (реальные данные из seed, соответствует примеру из `docs/api/FRONTEND_BACKEND_CONTRACT.md` поле в поле), multi-stage `Dockerfile`, 12 vitest-тестов.
- Verify (реально прогнано, не только написано): `npm install` → `npm run db:generate -w apps/api` → `npm run db:migrate -w apps/api` → `npm run db:seed -w apps/api` → `npm run dev -w apps/api`; `curl /health` → `200`, `curl /ready` → `200 {postgres:"ok",redis:"ok"}`, неизвестный токен → `404 TABLE_NOT_FOUND`, seed-токен → `200` с корректным телом. `npm run lint/build/test -w apps/api` — чисто, 12/12. `docker build -f apps/api/Dockerfile .` из корня — собирается и работает.
- API impact: `packages/contracts` — источник истины для контракта, потребляется через npm workspace (`@fastpay/contracts`). См. COM-002 ниже — одно поле контракта потребует подтверждения Codex перед тем, как `apps/web` начнёт на него полагаться.
- Deferred (сознательно, не забыто): owner/staff-аутентификация, полный B1 CRUD (создание/редактирование заказов и позиций официантом), payment/tip/loyalty-таблицы, платёжный адаптер (B2). Следующий шаг Claude — B1.
- Next: Codex стартует/продолжает `apps/web` на реальном `packages/contracts` и живом `GET /v1/public/tables/:token/bill` вместо мока. Claude продолжает B1.

## 2026-08-20 — Codex

- Added: продуктовая спецификация, планы frontend/backend, архитектурные инварианты, API-договор, протокол совместной работы, CI/PR правила.
- Verify: прочитать `README.md`; markdown не требует runtime.
- API impact: нет, это до-кодовая документация.
- Next: Claude подтверждает/правит ADR-001 и создаёт `COM-001` с backend scaffold; Codex после этого начинает `apps/web`.

## 2026-08-20 — Claude (docs)

- Added: `docs/COMPETITIVE_BRIEF.md` (конкурентный анализ для входа в Кременчук — ключевой вывод: Expirenza by mono принадлежит monobank, нашему планируемому эквайеру, требуется ADR по мультипровайдерности до пилота), `docs/marketing/GTM_KREMENCHUK.md` (go-to-market план пилота), `docs/design/DESIGN_SYSTEM.md` (токены/компоненты/паттерны для `apps/web`, отправная точка для Codex).
- Verify: markdown, не требует runtime.
- API impact: нет.
- Open item for owner: нужен ADR по фискализации (ПРРО) и по числу эквайринг-провайдеров до маркетинговых обещаний в GTM-плане — см. `docs/COMPETITIVE_BRIEF.md` §5 и `docs/marketing/GTM_KREMENCHUK.md` §8.
- Next: Codex может использовать `docs/design/DESIGN_SYSTEM.md` как стартовые токены при начале `apps/web` (уже видно, что Codex начал ветку `feat/web-mobile-foundation` — см. INBOX/HANDOFF синхронизацию отдельно).
