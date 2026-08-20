# FastPay

FastPay — PWA-сервис для ресторанов: официант ведёт заказ по столу, гость сканирует QR-код, видит актуальный счёт и оплачивает его без ожидания терминала. Деньги поступают напрямую ресторану через его эквайринг; FastPay продаётся по подписке.

## Документация

- [Полное ТЗ MVP](docs/PRODUCT_SPEC_MVP.md)
- [План реализации: frontend и backend](docs/IMPLEMENTATION_PLANS.md)
- [Архитектура и доменная модель](docs/architecture/DOMAIN_AND_ARCHITECTURE.md)
- [Правила Git, PR и CI](docs/ENGINEERING_WORKFLOW.md)
- [Контракт frontend/backend](docs/api/FRONTEND_BACKEND_CONTRACT.md)
- [Совместная работа с Claude](collaboration/README.md)

## Роли в разработке

- **Codex** — frontend, PWA, UI-kit, клиентский QR-flow, интеграция с API, e2e-проверки.
- **Claude** — backend, БД, авторизация, платежи, webhooks, серверные тесты и миграции.
- Любые изменения общего API сначала фиксируются в `docs/api/FRONTEND_BACKEND_CONTRACT.md` и записываются в `collaboration/DECISIONS.md`.

## Стек (ADR-001, ACCEPTED)

npm workspaces monorepo: Next.js + TypeScript + Tailwind (`apps/web`), Fastify + TypeScript (`apps/api`), PostgreSQL + Drizzle ORM, Redis, Zod-контракты в `packages/contracts` (из них генерируется OpenAPI). Локальная среда — Docker Compose. Подробности и обоснование — `collaboration/DECISIONS.md`.

## Старт (backend)

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres redis
npm install
npm run db:migrate -w apps/api
npm run db:seed -w apps/api
npm run dev -w apps/api
```

`GET /health` и `GET /ready` должны отвечать `200`. `apps/web` появится после того, как Codex начнёт A0 на базе `packages/contracts` (см. `collaboration/INBOX.md`, COM-001).
