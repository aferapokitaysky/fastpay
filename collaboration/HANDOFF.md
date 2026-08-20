# Handoff — текущая рабочая база

## 2026-08-20 — Claude (merge web branch into main, reconcile ADR-002)

- Смержены PR #1–#3 в `main` (docs, backend B0, конкурентный анализ/GTM/дизайн-система) — `main` был пуст, вся работа висела ветками поверх пустого init-коммита.
- Обнаружено на слиянии: Codex запушил `feat(web): support fixed and custom tip amounts`, которое независимо чинило те же 2 блокера чаевых, что и мой `fix/web-guest-payment-blockers`, но через смену модели с процентов на фиксированную сумму — и оформил это как `ADR-002 (Status: ACCEPTED)`, хотя связанный `COM-004` одновременно был `OPEN`/"Request/decision needed". Понизил ADR-002 до `CONTESTED`, контракт (`percentOptions`) не менял — см. ADR-002 и ответ в COM-004 для полной аргументации. Это открытый вопрос для владельца продукта, не для агентов.
- Свёл `fix/web-guest-payment-blockers` с последними коммитами Codex (`edd5144`): взял его `formatMoney` через `formatToParts` (лучше моего варианта — не хардкодит символ, использует локализованные ICU-части), взял его UX для «Своя» (отдельная кнопка вместо всегда видимого поля) и `guest-meta`/trust-badge вёрстку; оставил свою процентную модель чаевых, `isPayable`-осведомлённый split и снапшот суммы на экране успеха (без них частичная оплата отображалась как оплата всего счёта).
- Verify: `npm run typecheck/lint/build -w apps/web` — чисто после мержа; проверено в браузере (Chrome, mobile viewport 375×812): отказ от чаевых, своя сумма, split с задизейбленной оплаченной позицией, экран успеха с реальными venue/table и верной частичной суммой — все с реальными данными демо-фикстуры, приведённой к форме настоящего API-ответа.
- Next: смержить `fix/web-guest-payment-blockers` в `feat/web-mobile-foundation` (или в `main` через PR), затем в `apps/web` — дождаться B1 (`feat/api-domain-and-auth`, в работе) для staff/owner эндпоинтов.

## 2026-08-20 — Codex (web A0/A1)

- Added: `apps/web` Next.js mobile-first shell, PWA manifest, компоненты `Money` и guest payment UI; preview `/staff` и `/owner`.
- Verify: `npm run build -w apps/web`, `npm run lint -w apps/web`, открыть `/t/demo-table-02`.
- API impact: COM-002 закрепляет `order: null` как `no_active_order`; реальная интеграция с `@fastpay/contracts` и public API начинается в следующем frontend commit.
- Next: заменить development fixture на API adapter, добавить public error/empty/paid states; Claude продолжает B1 и сообщает о realtime/payment endpoints через COM-003.

## 2026-08-20 — Claude (fix guest payment blockers)

- Added: исправлены 4 блокера в guest-флоу (`fix/web-guest-payment-blockers`), найденные при ревью PR #4, плюс один баг, найденный уже при браузерной проверке:
  1. Кнопка «Ні» (без чайових) теперь рендерится всегда, а не только если сервер прислал `0` в `percentOptions`. Реальный API присылает `[5,10,15]` — гость не мог отказаться от чаевых (ТЗ §5.8).
  2. Реализован ввод своей суммы чаевых при `tips.customAllowed` — флаг контракта раньше игнорировался.
  3. Split больше не даёт выбрать уже оплаченную позицию (`paymentStatus: "paid"` / `remainingKopecks === 0`) — ТЗ §5.4.
  4. Экран успеха берёт заведение/стол из props, а не из захардкоженного «GOODMAN · Стіл 02».
  5. **`lib/money.ts`**: `Intl.NumberFormat(style: "currency")` даёт разный символ гривны в Node (`₴`) и Chromium (`грн`) из-за разных версий ICU → hydration mismatch на каждой сумме. Форматируем только число (стабильно между средами) и добавляем `₴` сами.
- Verify (реально прогнано в браузере, не только сборкой): `npm run typecheck/lint/build -w apps/web` — чисто; dev-сервер + проверка DOM: «Ні» → итог равен сумме страв без чайових (1 120,00 ₴); своя сума 50 → 1 170,00 ₴; оплаченная позиция в split — `disabled: true`; частичная оплата → экран успеха показывает ровно оплаченные 352,00 ₴ и «Вашу частину сплачено»; dev-overlay больше не показывает hydration issue.
- API impact: нет. Фикстура `demo-bill.ts` приведена к реальному ответу API (`percentOptions: [5,10,15]`, есть позиция со статусом `paid`), чтобы демо проверяло то же, что и продакшен.
- Next: `docs/design/DESIGN_SYSTEM.md` обновлён — прежнее правило «форматировать через `style: currency`» было причиной бага.

## 2026-08-20 — Claude (docs)

- Added: `docs/COMPETITIVE_BRIEF.md` (конкурентный анализ для входа в Кременчук — ключевой вывод: Expirenza by mono принадлежит monobank, нашему планируемому эквайеру, требуется ADR по мультипровайдерности до пилота), `docs/marketing/GTM_KREMENCHUK.md` (go-to-market план пилота), `docs/design/DESIGN_SYSTEM.md` (токены/компоненты/паттерны для `apps/web`, отправная точка для Codex).
- Verify: markdown, не требует runtime.
- API impact: нет.
- Open item for owner: нужен ADR по фискализации (ПРРО) и по числу эквайринг-провайдеров до маркетинговых обещаний в GTM-плане — см. `docs/COMPETITIVE_BRIEF.md` §5 и `docs/marketing/GTM_KREMENCHUK.md` §8.

## 2026-08-20 — Claude (B0 done)

- Added: `apps/api` (Fastify + TS) и `packages/contracts` (`@fastpay/contracts`) реализованы и запушены в `feat/api-platform-foundation` (6 коммитов, HEAD `c93072e`). Drizzle-схема (7 таблиц, только MVP-объём: organizations/venues/floors/tables/menu_items/orders/order_items), миграции в `apps/api/drizzle`, идемпотентный `db:seed` (demo-ресторан "Goodman Demo", печатает QR-токен в stdout), request-id + error-envelope middleware, `GET /health`, `GET /ready` (проверяет Postgres+Redis), `GET /v1/public/tables/:token/bill` (реальные данные из seed, соответствует примеру из `docs/api/FRONTEND_BACKEND_CONTRACT.md` поле в поле), multi-stage `Dockerfile`, 12 vitest-тестов.
- Verify (реально прогнано, не только написано): `npm install` → `npm run db:generate -w apps/api` → `npm run db:migrate -w apps/api` → `npm run db:seed -w apps/api` → `npm run dev -w apps/api`; `curl /health` → `200`, `curl /ready` → `200 {postgres:"ok",redis:"ok"}`, неизвестный токен → `404 TABLE_NOT_FOUND`, seed-токен → `200` с корректным телом. `npm run lint/build/test -w apps/api` — чисто, 12/12. `docker build -f apps/api/Dockerfile .` из корня — собирается и работает.
- API impact: `packages/contracts` — источник истины для контракта, потребляется через npm workspace (`@fastpay/contracts`).
- Deferred (сознательно, не забыто): owner/staff-аутентификация, полный B1 CRUD (создание/редактирование заказов и позиций официантом), payment/tip/loyalty-таблицы, платёжный адаптер (B2). Следующий шаг Claude — B1.

## 2026-08-20 — Codex

- Added: продуктовая спецификация, планы frontend/backend, архитектурные инварианты, API-договор, протокол совместной работы, CI/PR правила.
- Verify: прочитать `README.md`; markdown не требует runtime.
- API impact: нет, это до-кодовая документация.
- Next: Claude подтверждает/правит ADR-001 и создаёт `COM-001` с backend scaffold; Codex после этого начинает `apps/web`.
