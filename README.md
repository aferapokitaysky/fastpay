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

## Старт

Репозиторий намеренно начинается с продуктовой и инженерной базы. После выбора стека создаются два независимых приложения: `apps/web` (frontend) и `apps/api` (backend), а общие контракты хранятся в `packages/contracts`.
