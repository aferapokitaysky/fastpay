# Handoff — текущая рабочая база

## 2026-08-20 — Codex (A2 live data and public-bill hardening)

- Added: staff PWA consumes live B1 floor snapshots, order details and venue menu; all live add/remove/request-bill actions use the server `version` and an idempotency key. Floor state now derives from active-order status; realtime events refresh the floor snapshot.
- Safety: public checkout no longer turns into a fake success screen outside the `demo-table-02` fixture. The guest bill polls its public API endpoint every 15 seconds as a fallback for server-side payment/webhook changes.
- CI: PR workflow now runs the web lint, strict typecheck and production build.
- Verify: `npm run lint -w apps/api`, `npm run build -w apps/api`, `npm run lint -w apps/web`, `npm run typecheck -w apps/web`, `npm run build -w apps/web`.
- API impact: additive `GET /v1/staff/floor`, `GET /v1/staff/orders/:id`; staff may read own-venue menu. COM-007 asks Claude to publish the B2 PaymentIntent contract before checkout is wired.
- Next: frontend must replace the temporary payment-unavailable response with a PaymentIntent redirect + webhook-confirmed return state when B2 is available.

## 2026-08-20 — Claude (staff realtime contract)

- Added: `packages/contracts/src/staffRealtime.ts` — `StaffRealtimeEvent`/`StaffRealtimeIncomingMessage`/`StaffRealtimeCommand`, формализует поле в поле клиентский адаптер, который Codex уже написал в `apps/web/lib/staff-realtime.ts` (см. `collaboration/CLAUDE_DESIGN_PROMPT.md` и COM-006). 5 тестов в `test/contracts.test.ts`.
- В ответ на дизайн-бриф Codex сделал НЕ полную дизайн-переработку, а короткий аудит: staff-экран уже реализован компетентно по большинству пунктов брифа (breakpoints, PIN, зал/заказ/уведомления, кастомные иконки) — писать поверх ещё один прескриптивный документ означало бы дублировать уже сделанную работу. Единственный уникально бэкендовый кусок брифа — realtime-контракт — сделан.
- Verify: `npm run build/lint -w packages/contracts` — чисто; `npm test -w apps/api` — 56/56 (было 51, +5 новых).
- Next: B3 (настоящий WebSocket-сервер под этот контракт) — после B2 (платёжный адаптер). Claude переходит к B2.

## 2026-08-20 — Claude (B1 done)

- Added: полный B1 (`apps/api`) — auth (`POST /v1/owner/register`, `.../staff/session/password`, `.../pin`, `.../logout`; Redis-сессии, argon2id, rate-limit 5/15мин), RBAC + tenant-изоляция (чужой tenant → 404, недостающая роль → 403), CRUD venues/floors/tables/menu-items/employees, ротация QR с немедленной инвалидацией, полный жизненный цикл заказа (открытие с защитой от гонки на уровне БД, `PATCH` с `version`/`409 ORDER_VERSION_CONFLICT`, `request-bill`, `close` с audit log при остатке). `docs/api/FRONTEND_BACKEND_CONTRACT.md` переписан с реальными staff/owner эндпоинтами вместо "примеров" — см. COM-005.
- Added: 51 vitest-тест (`apps/api/test/{staffAuth,tenantIsolation,domainCrud,orderLifecycle}.test.ts`) — реальный Fastify app + Postgres + Redis, без моков, включая настоящую гонку (8 параллельных POST на один стол) и проверку audit-записей прямым запросом к БД.
- Found and fixed two real bugs, не связанных с самим B1-кодом:
  1. При слиянии с `main` (см. запись ниже) `eslint-config-next` в `apps/web` тянет `zod@4` в корень монорепо и вытесняет общий `zod@^3.23.8`, из-за чего `apps/api` и `packages/contracts` получали каждый свою изолированную копию — `instanceof ZodError` в `errorHandler.ts` не срабатывал между ними, и валидационные ошибки схем из `packages/contracts` тихо превращались в `500` вместо `400`. Поймано тестами (не удачей), пофикшено явным `zod` в корневом `package.json`.
  2. Мои же тесты были хрупкими: захардкоженные email/rate-limit ключи копились между локальными прогонами `npm test` против одной и той же Postgres/Redis (CI поднимает свежие контейнеры на каждый запуск, локально — нет). Добавлен `uniqueEmail()` в `test/helpers.ts`, прогнал сьют дважды подряд без сброса БД — 51/51 оба раза.
- Verify: `npm run lint/build -w apps/api` — чисто; `npm test -w apps/api` — 51/51, дважды подряд; после чистого `rm -rf **/node_modules && npm install` — единая копия `zod@3.25.76` в корне, полный монорепо-билд (`web`+`api`+`contracts`) и полный монорепо-линт — чисто.
- Deferred (B2/B3, не забыто): PaymentIntent/эквайринг, чаевые как отдельная сущность, realtime/outbox, loyalty.
- Next: Codex может строить staff PWA (A2) и owner dashboard (A3) на реальном контракте из `docs/api/FRONTEND_BACKEND_CONTRACT.md` — см. COM-005. Claude переходит к B2 (платёжный адаптер).

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
