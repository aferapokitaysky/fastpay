# Два плана реализации MVP

## Общие принципы

Работа идёт вертикальными срезами: каждая feature-ветка даёт проверяемую ценность и не требует незавершённых «потом допишем». Frontend и backend объединяются только через версионируемый контракт. Условный стек для фиксации на kickoff: TypeScript monorepo, Next.js PWA для `apps/web`, NestJS/Fastify для `apps/api`, PostgreSQL + Prisma/Drizzle, Redis для очередей/резерваций, OpenAPI/Zod для контрактов. Финальный стек подтверждается в ADR-001.

## План A — Codex / frontend

### A0. Foundation

**Результат:** web-приложение с единым стилем, маршрутизацией, типами, линтингом, тестовой страницей и preview в CI.

- Создать `apps/web`, `packages/ui`, `packages/contracts` и root scripts.
- Настроить TypeScript strict, ESLint, Prettier, commit hooks (опционально) и `.env.example` без ключей.
- Настроить дизайн-токены: neutral/brand/success/warning/danger, типографику, 8px spacing, радиусы, shadows, z-index и motion.
- Сделать app shell, error/not-found/loading states, toast-уведомления, data-fetching слой и auth guards.
- Подключить PWA manifest, icons, install prompt и service-worker стратегию: assets cache-first, API network-first, payment endpoints никогда не кешировать.
- Проверки: typecheck, lint, unit test, production build, Lighthouse smoke test.

### A1. Public QR payment flow

**Результат:** гость по публичной ссылке проходит понятный, быстрый и доступный путь до перехода в эквайринг.

- Маршрут `/t/[token]` с состояниями `no_active_order`, `building_order`, `ready_to_pay`, `fully_paid`, `qr_invalid`, `temporarily_unavailable`.
- Компоненты `VenueHeader`, `BillItems`, `PaidItems`, `Money`, `BillSummary`, `LiveStatus`, skeletons.
- Синхронизация счёта: polling fallback + SSE/WebSocket; при событии показывать ненавязчивое «Счёт обновился» и пересчитывать сумму.
- Экран выбора: «весь остаток» / «разделить»; split интерфейс со степперами количества, disabled reserved/paid items, закреплённой кнопкой суммы.
- Экран чаевых с фиксированными суммами заведения и ручным вводом UAH; валидировать лимиты и показывать отдельную сумму чаевых рядом с итогом.
- Создание PaymentIntent через backend, защита от двойного нажатия, страница ожидаемого возврата, polling статуса после перехода от провайдера.
- Дизайн для 320px+, large type и screen reader labels. Никакой карточной информации на frontend.
- Тесты: формат денег, расчёт split/чаевых, все пустые/ошибочные состояния, e2e happy path с mock API.

### A2. Staff PWA

**Результат:** официант с телефона может создать заказ, увидеть оплату и закрыть стол.

- PIN login, защищённый session lifecycle, экран выбора заведения/смены при необходимости.
- `/staff/floor`: зоны, карточки столов, легенда, фильтр, live status, ощутимая доступность статусов.
- `/staff/orders/[id]`: категории меню, поиск, добавление/удаление/количество/комментарий, sticky order summary.
- Действия «Открыть заказ», «Позвать счёт», «Закрыть стол» с confirmation и обработкой conflict/409.
- Блок оплат: платежи, чаевые, остаток, частичные оплаты; realtime alerts с deep link.
- Оптимистичные обновления только для обратимых действий; серверные версии/ETag для обработки конфликтов.
- Тесты RTL для форм, Playwright для login → open order → guest payment event → close.

### A3. Owner dashboard and settings

**Результат:** владелец настраивает ресторан без участия команды Rimvo и видит базовую пользу.

- `/owner/dashboard`: период, KPI, популярные блюда, официанты, среднее время; empty states и timezone aware даты.
- CRUD заведений, зон, столов, меню/категорий, персонала; все destructive actions через confirmation.
- QR studio: предпросмотр карточки, экспорт PDF/PNG/SVG с корректным print layout и короткой инструкцией гостю.
- Экран бренда, чаевых и эквайринга (без отображения секретов после сохранения).
- Статусы интеграции и диагностические, но не чувствительные, ошибки.

### A4. Frontend hardening / release

- Проверить accessibility, мобильные Safari/Android, slow 3G, переходы от эквайера, потерю сети.
- Подключить error reporting с фильтрацией PII, аналитические события без платёжных данных.
- Ручной чек-лист пилота, release notes, feature flags для split суммы и loyalty.

## План B — Claude / backend

### B0. Platform foundation

**Результат:** защищённый API, миграции, локальная среда и базовый CI.

- Структура `apps/api`, контейнеры/dev-compose, PostgreSQL, Redis, миграции, seed demo restaurant.
- Мультиарендность и RBAC middleware, correlation/request ID, единый error format.
- Owner auth (email OTP/password согласно решению), staff PIN sessions с rate limiting, audit log.
- OpenAPI/Zod schema generation; запрет breaking changes без versioning.
- Unit/integration test setup, test database per suite, health/readiness endpoints.

### B1. Restaurant operating domain

**Результат:** управляемые заведения, столы, меню и жизненный цикл заказа.

- CRUD organization/venue/floor/table, безопасная генерация и rotation QR token.
- CRUD menu category/item с ценовыми snapshots.
- Order и order items; транзакционные проверки "один активный заказ на стол"; audit critical writes.
- Public read endpoint, не раскрывающий внутренние IDs/данные персонала.
- Staff endpoints с ownership checks и version/concurrency policy.
- Тесты инвариантов, чужого tenant, отредактированной цены, закрытия с остатком.

### B2. Payment domain and provider adapter

**Результат:** идемпотентная безопасная оплата целого и разделённого счёта через sandbox выбранного провайдера.

- `PaymentProvider` adapter interface; первый адаптер и fake provider для тестов.
- PaymentIntent, allocation, reservation TTL, worker для снятия истёкших reservation.
- Транзакционная блокировка allocations; money в копейках; не доверять сумме клиента.
- Секреты интеграции зашифровать и rotatable; endpoint проверки подключения без утечки ключей.
- Создание invoice, webhook endpoint, верификация подписи/event ID, idempotent consumer и reconciliation job.
- Отдельные состояния `failed/expired/cancelled/review_required`; возврат — пока internal recording или provider adapter согласно договорённости.
- Тесты race conditions: два гостя платят одну позицию, повтор webhook, redirect раньше webhook, webhook с другой суммой.

### B3. Realtime, reporting, loyalty

**Результат:** согласованные статусы на экранах и полезные показатели владельца.

- Domain events + outbox pattern, SSE/WebSocket channels, authorization public/staff.
- In-app notifications и read/unread при необходимости.
- Daily aggregates / query endpoints: выручка, средний чек, QR share, tips, блюда, официанты, duration metrics.
- Guest loyalty opt-in: consent record, protected/hashing strategy для телефона, export/delete endpoint, retention policy config.
- Фоновые джобы и DLQ/повторная обработка; monitoring payment webhook backlog.

### B4. Release engineering

- Backup/restore runbook, migrations rollback strategy, secret rotation procedure.
- Security pass: rate limits, auth sessions, CORS/CSRF, logs redaction, dependency scan.
- Contract tests с frontend, sandbox payment smoke test, load test public bill endpoint.
- Production checklist: DNS/TLS, database backups, alerts, incident contacts, privacy/terms URLs.

## Приоритет выпусков

| Release | Доступная ценность | Критерий готовности |
|---|---|---|
| R0 | foundation + demo data | CI зелёный, web/api запускаются локально |
| R1 | официант создаёт заказ, гость видит счёт | public URL из реального QR показывает изменения |
| R2 | оплата всего остатка + чаевые | sandbox webhook закрывает заказ без ручной правки |
| R3 | split bill | конкурентные оплаты не дают двойного allocation |
| R4 | owner setup и analytics | владелец сам создаёт стол и получает QR/export |
| Pilot | production-ready MVP | security/legal/payment checklist подписан |
