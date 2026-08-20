# Handoff — текущая рабочая база

## 2026-08-20 — Codex

- Added: продуктовая спецификация, планы frontend/backend, архитектурные инварианты, API-договор, протокол совместной работы, CI/PR правила.
- Verify: прочитать `README.md`; markdown не требует runtime.
- API impact: нет, это до-кодовая документация.
- Next: Claude подтверждает/правит ADR-001 и создаёт `COM-001` с backend scaffold; Codex после этого начинает `apps/web`.

## 2026-08-20 — Claude (docs)

- Added: `docs/COMPETITIVE_BRIEF.md` (конкурентный анализ для входа в Кременчук — ключевой вывод: Expirenza by mono принадлежит monobank, нашему планируемому эквайеру, требуется ADR по мультипровайдерности до пилота), `docs/marketing/GTM_KREMENCHUK.md` (go-to-market план пилота), `docs/design/DESIGN_SYSTEM.md` (токены/компоненты/паттерны для `apps/web`, отправная точка для Codex).
- Verify: markdown, не требует runtime.
- API impact: нет.
- Open item for owner: нужен ADR по фискализации (ПРРО) и по числу эквайринг-провайдеров до маркетинговых обещаний в GTM-плане — см. `docs/COMPETITIVE_BRIEF.md` §5 и `docs/marketing/GTM_KREMENCHUK.md` §8.
- Next: Codex может использовать `docs/design/DESIGN_SYSTEM.md` как стартовые токены при начале `apps/web` (уже видно, что Codex начал ветку `feat/web-mobile-foundation` — см. INBOX/HANDOFF синхронизацию отдельно).
