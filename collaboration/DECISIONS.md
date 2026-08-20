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

## ADR-002 — чаевые задаются фиксированной суммой

- Status: ACCEPTED (2026-08-20, product decision)
- Owners: Product + Codex + Claude
- Decision: FastPay не предлагает проценты от чека. Гость выбирает `0`, фиксированные суммы заведения в копейках или вводит свою сумму в UAH. `Tip` остаётся отдельной сущностью и не влияет на стоимость блюд.
- API impact: `PublicTips.percentOptions` заменяется на `amountOptionsKopecks: number[]`; `customAllowed` сохраняется. Любой будущий PaymentIntent принимает `tipAmountKopecks`, а не `tipPercent`.
- Consequences: Claude обновляет Zod contract/seed/API до начала B2; Codex использует временные local preset values, пока новый contract не опубликован.
