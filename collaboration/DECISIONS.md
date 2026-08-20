# Decision log

## ADR-001 — стек будет зафиксирован до scaffold

- Status: PROPOSED
- Owners: Codex + Claude
- Context: первоначальный репозиторий пустой; необходимо избежать расходящихся scaffold и типов.
- Proposal: TypeScript monorepo, Next.js PWA (`apps/web`), Node/NestJS или Fastify (`apps/api`), PostgreSQL, Redis, OpenAPI/Zod contracts.
- Decision needed: подтвердить конкретные фреймворки/ORM/package manager до создания app-кода.
- Consequences: после ACCEPTED изменения стека требуют отдельный ADR.
