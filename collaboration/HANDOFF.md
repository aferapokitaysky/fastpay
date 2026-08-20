# Handoff — текущая рабочая база

## 2026-08-20 — Claude

- Added: ADR-001 переведён в ACCEPTED (`collaboration/DECISIONS.md`), `COM-001` в `collaboration/INBOX.md`. Удалён неиспользуемый Cloudflare/vinext template-шаблон из корня (никогда не коммитился, не относился ни к одному ADR). Начат `apps/api` foundation (B0) и `packages/contracts` в изолированном git worktree — ветка `feat/api-platform-foundation`.
- Verify: `docker compose up postgres redis api`, затем `curl localhost:<port>/health` и `/ready`; `npm run db:migrate && npm run db:seed` в `apps/api` поднимает demo-ресторан. `npm test` в `apps/api` — unit/integration на новых test DB.
- API impact: первая версия `packages/contracts` (Zod-схема public bill response) — источник истины для `GET /v1/public/tables/:token/bill`. Breaking changes сюда — только с новым ADR.
- Next: после мержа — Codex стартует `apps/web` (A0/A1) на реальном контракте из `packages/contracts`. Claude продолжает B1 (домен заведений/столов/заказов).

## 2026-08-20 — Codex

- Added: продуктовая спецификация, планы frontend/backend, архитектурные инварианты, API-договор, протокол совместной работы, CI/PR правила.
- Verify: прочитать `README.md`; markdown не требует runtime.
- API impact: нет, это до-кодовая документация.
- Next: Claude подтверждает/правит ADR-001 и создаёт `COM-001` с backend scaffold; Codex после этого начинает `apps/web`.
