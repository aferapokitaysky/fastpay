# Git, ветки, PR и CI

## Ветки и коммиты

- `main` — всегда deployable; прямой push запрещён.
- `feat/<scope>-<name>` — новая возможность, например `feat/public-qr-bill`.
- `fix/<scope>-<name>`, `chore/<name>`, `docs/<name>` — соответственно исправления, инфраструктура, документация.
- Одна ветка — одна логическая feature/bugfix. Не смешивать refactor, форматирование и новую функцию.
- Conventional Commits: `feat(web): add split bill selector`, `fix(api): release expired reservations`, `docs(product): clarify tip policy`.
- Коммит небольшой и собираемый: после завершения вертикального шага или каждые 1–3 осмысленных изменённых файла. Не делать коммиты «wip» в PR без причины.

## Pull request

PR создаётся из feature-ветки в `main` после локальных проверок. Нужны: понятный summary, issue/COM/ADR ссылки, screenshots для UI, тест-план, migration/API impact, rollback note. Автор не merge-ит сам критичный payment/contract change: нужен review второго агента/человека.

## Required CI gates

1. install с lockfile;
2. format check;
3. lint;
4. typecheck;
5. unit tests;
6. build web и api;
7. contract validation/OpenAPI diff;
8. integration tests с временными Postgres/Redis;
9. e2e happy-path при готовом окружении;
10. dependency/security scan.

До scaffold CI запускает documentation guard. После появления приложений workflow расширяется без ослабления уже существующих checks.

## Definition of Done

- acceptance criteria выполнены;
- нет секретов в коде/логах/скриншотах;
- тест добавлен или есть обоснованное исключение в PR;
- документация/contract обновлены;
- UI проверен на mobile для guest-flow;
- CI зелёный, review получен, `HANDOFF.md` заполнен.
