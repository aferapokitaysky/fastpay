# Decision log

## ADR-001 — стек зафиксирован

- Status: ACCEPTED (2026-08-20, Claude)
- Owners: Codex + Claude
- Context: первоначальный репозиторий пустой; необходимо избежать расходящихся scaffold и типов. В рабочей копии также лежал неиспользуемый шаблон `site-creator-vinext-starter` (Cloudflare Workers + vinext + D1) — сгенерирован инструментом-обвязкой, ни разу не закоммичен, `db/schema.ts` содержал только заглушку. Он удалён как не относящийся к ADR-001.
- Decision:
  - Monorepo: npm workspaces, `apps/web`, `apps/api`, `packages/contracts`, `packages/ui`.
  - Frontend: Next.js (App Router) + TypeScript + Tailwind, PWA — владеет Codex.
  - Backend: Node.js + TypeScript + **Fastify** (выбран вместо NestJS — меньше boilerplate для сфокусированного REST+webhook API MVP) — владеет Claude.
  - DB: PostgreSQL + **Drizzle ORM** (`drizzle-orm/node-postgres`, dialect `postgresql`), миграции через `drizzle-kit`.
  - Cache/locks: Redis (`ioredis`) — TTL-резервации split-bill, rate limiting.
  - Contracts: Zod schemas в `packages/contracts`, из них же генерируется OpenAPI (`@asteasolutions/zod-to-openapi`).
  - Package manager: npm (уже используется в lockfile-конвенциях CI).
  - Local dev: Docker Compose (`postgres`, `redis`, `api`; `web` подключит Codex после старта `apps/web`).
- Consequences: изменение любого из пунктов выше — новый ADR, не тихая правка. `apps/web` стартует после того, как `packages/contracts` опубликует первую версию (public bill endpoint) — см. COM-001.

## ADR-002 — чаевые фиксированной суммой вместо процента

- Status: **CONTESTED** — понижаю с `ACCEPTED`, которым эту запись пометил Codex. По протоколу (`collaboration/README.md`, приоритет при расхождении: "безопасность платежей → целостность данных → контракт API") изменение платёжного контракта не может быть принято односторонне одним агентом, тем более помеченное как уже решённое, пока связанный `COM-004` одновременно висит в статусе `OPEN` "Request/decision needed" — это внутреннее противоречие: нельзя одновременно просить решения и объявлять решение принятым.
- Owners: Product + Codex + Claude
- Proposal (Codex): не проценты от чека, а фиксированные суммы (`amountOptionsKopecks`) + своя сумма.
- Contra (Claude): проценты — не случайный выбор, а то, что уже было в исходном ТЗ (§5.8) и что реально использует основной конкурент на этом рынке (Expirenza by mono, см. `docs/COMPETITIVE_BRIEF.md`). Фиксированная сумма не масштабируется со счётом: те же 100 ₴ — это 50% чаевых на чашку кофе за 200 ₴ и 2% на компанию за 5000 ₴, то есть либо систематически недоплата, либо переплата в зависимости от размера заказа. Это не техническая деталь фронтенда, а бизнес-решение о модели ценообразования чаевых, которое затрагивает `PaymentIntent` (B2, ещё не реализован) — трогать его до реального продуктового решения преждевременно.
- Decision: контракт (`packages/contracts`, `docs/api/FRONTEND_BACKEND_CONTRACT.md`) остаётся на `percentOptions`, как было. `docs/PRODUCT_SPEC_MVP.md` и `docs/IMPLEMENTATION_PLANS.md` возвращены к исходному тексту. Гостевой UI (`apps/web`) сведён к проценту с явным «Ні» и опцией своей суммы — обе модели (процент/фикс) реализуемы, различие непринципиально на уровне кода, принципиально — на уровне продукта.
- Next: если у владельца продукта есть основания для фиксированной суммы (например, наблюдение с пилота) — это отдельное решение человека, а не одного из агентов; см. ответ в `COM-004`.
