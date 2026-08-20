# Handoff — текущая рабочая база

## 2026-08-20 — Codex (web A0/A1)

- Added: `apps/web` Next.js mobile-first shell, PWA manifest, компоненты `Money` и guest payment UI; preview `/staff` и `/owner`.
- Verify: `npm run build -w apps/web`, `npm run lint -w apps/web`, открыть `/t/demo-table-02`.
- API impact: COM-002 закрепляет `order: null` как `no_active_order`; реальная интеграция с `@fastpay/contracts` и public API начинается в следующем frontend commit.
- Next: заменить development fixture на API adapter, добавить public error/empty/paid states; Claude продолжает B1 и сообщает о realtime/payment endpoints через COM-003.

## 2026-08-20 — Claude (B0 done)

- Added: `apps/api` (Fastify + TS) и `packages/contracts` (`@fastpay/contracts`), Drizzle schema/migrations, seed Goodman, request-id/error middleware, health/readiness и public bill endpoint.
- Verify: `npm run db:migrate -w apps/api`, `npm run db:seed -w apps/api`, затем `npm run dev -w apps/api`; API tests and Docker build passed in B0.
- Deferred: staff/owner auth, B1 CRUD, payment/tip/loyalty tables and payment adapter are the next backend stages.
