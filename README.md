# Rimvo

![CI](https://github.com/aferapokitaysky/rimvo/actions/workflows/ci.yml/badge.svg)

**Rimvo** — PWA-сервис для ресторанов: официант ведёт заказ по столу, гость сканирует QR-код на столе, видит актуальный счёт и оплачивает его прямо с телефона — без ожидания терминала и подзыва официанта. Деньги поступают напрямую заведению через его собственный эквайринг; Rimvo монетизируется подпиской, а не комиссией с оборота.

## Возможности

- **Гость**: QR на столе → живой счёт → оплата всей суммы или своей части (split bill) → чаевые → опциональный loyalty opt-in по телефону.
- **Официант**: PIN-вход, зал/столы, ведение заказа, realtime-уведомления о счёте/оплате по WebSocket.
- **Владелец/менеджер**: управление меню, столами, персоналом, настройка эквайринга, ежедневная аналитика (выручка, чаевые, средний чек, топ-блюда, эффективность персонала).

## Стек

Монорепозиторий на npm workspaces:

| Компонент | Стек |
|---|---|
| `apps/web` | Next.js + TypeScript + Tailwind — PWA для гостя/персонала/владельца |
| `apps/api` | Fastify + TypeScript — REST + WebSocket API |
| `packages/contracts` | Zod-схемы — единый источник истины для контракта `web` ↔ `api` |
| Данные | PostgreSQL (Drizzle ORM) + Redis (сессии, rate-limit) |
| Локальная среда | Docker Compose |

Обоснование выбора — `collaboration/DECISIONS.md` (ADR-001).

## Быстрый старт

Понадобятся Node.js 20+, Docker, npm.

```bash
git clone https://github.com/aferapokitaysky/rimvo.git
cd rimvo
npm install
```

### Backend

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres redis
npm run db:migrate -w apps/api
npm run db:seed -w apps/api      # демо-заведение "Goodman", стол 02, QR-токен в выводе команды
npm run dev -w apps/api          # http://localhost:4000
```

`GET /health` и `GET /ready` должны отвечать `200`.

### Frontend

```bash
npm run dev -w apps/web          # http://localhost:3000
```

По умолчанию `apps/web` обращается к API на `http://localhost:4000` (`NEXT_PUBLIC_API_URL`).

## Проверка перед PR

```bash
npm run lint --workspaces
npm run build --workspaces
npm run test --workspaces
```

CI (`.github/workflows/ci.yml`) прогоняет то же самое на каждый push/PR в `main`.

## Документация

- [Продуктовая спецификация MVP](docs/PRODUCT_SPEC_MVP.md)
- [План реализации: frontend и backend](docs/IMPLEMENTATION_PLANS.md)
- [Архитектура и доменная модель](docs/architecture/DOMAIN_AND_ARCHITECTURE.md)
- [Контракт frontend/backend](docs/api/FRONTEND_BACKEND_CONTRACT.md)
- [Правила Git, PR и CI](docs/ENGINEERING_WORKFLOW.md)
- [Совместная работа Codex ↔ Claude](collaboration/README.md)

## Роли в разработке

- **Codex** — frontend, PWA, UI-kit, клиентский QR-flow, интеграция с API, e2e-проверки.
- **Claude** — backend, БД, авторизация, платежи, webhooks, серверные тесты и миграции.
- Любое изменение общего API сначала фиксируется в `docs/api/FRONTEND_BACKEND_CONTRACT.md` и записывается в `collaboration/DECISIONS.md`; координация текущей работы — через `collaboration/HANDOFF.md` и `collaboration/INBOX.md`.

## Лицензия

Частный коммерческий проект. Все права защищены.
