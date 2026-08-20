# Rimvo — production execution plan

**Цель:** довести Rimvo от UI-прототипа до безопасного MVP для пилотного ресторана. Очерёдность обязательна: нельзя выпускать оплату до проверки платежей, realtime до авторизации, а CRM до корректных данных заказа.

## Definition of Done MVP

Пилот готов, если ресторан может создать стол и QR; официант войти по PIN, вести заказ и позвать счёт; гость оплатить весь/частичный счёт с чаевыми; webhook безопасно закрывает платёж; официант видит событие; владелец видит реальные агрегированные показатели. Все критические пути имеют тесты, логирование и rollback-процедуру.

## Phase 0 — foundations and decisions

**Owner:** product + backend + frontend. **Gate:** до payment integration.

- [ ] Подтвердить название/домен Rimvo, legal entity, privacy policy и terms.
- [ ] Утвердить ADR по эквайрингу: первый provider, merchant onboarding, возвраты, ПРРО/фискализация, поддержка нескольких providers.
- [ ] Утвердить модель чаевых (проценты или фиксированные суммы) и закрыть ADR-002/COM-004.
- [ ] Настроить environments: local, preview, staging, production; отдельные keys и базы.
- [ ] Секреты только в secret manager/CI variables; никаких `.env` в git.
- [ ] Установить Sentry (frontend/API), structured logs, request ID и alerting по payment webhook errors.

**Acceptance:** owner письменно подтвердил платежный и legal scope; staging изолирован от production.

## Phase 1 — authenticated restaurant operations (B1/A2)

**Backend (Claude)**

- [x] Organization/venue/floor/table/menu/order CRUD.
- [x] Staff auth: PIN never stored plaintext; short-lived access + refresh/session strategy; role checks owner/manager/waiter.
- [x] Optimistic concurrency with `order.version`, `409 ORDER_VERSION_CONFLICT` and recoverable payload.
- [x] Audit events for menu, orders, PIN/auth and QR reissue.
- [x] Staff endpoints: floor snapshot, open order, add/remove item, request bill, close table.

**Frontend (Codex)**

- [x] Replace staff fixtures with API adapter and loading/error/empty states.
- [x] PIN lifecycle, expired session UI and role-aware route guards.
- [x] Order editor with conflict resolution: show latest version, prevent double submit.
- [x] Owner tables/QR use live data; browser print and PNG export are generated from the active public token.

**Acceptance:** two waiters cannot silently overwrite each other; all mutations are tenant-scoped.

## Phase 2 — payment engine (B2/A1)

**Backend (Claude)**

- [ ] PaymentIntent model: order snapshot, amount, tip, status, provider reference, idempotency key.
- [ ] Create provider invoice only from server-calculated outstanding amount.
- [ ] Verify provider webhook signature; store raw metadata safely; idempotent consumer by provider event ID.
- [ ] Reconcile pending invoices; failure/retry/expiry transitions; never trust browser success callback.
- [ ] Payment split reservation: atomic item lock, expiration, release on failed/expired intent.
- [ ] Refund/cancel decision documented even if UI is deferred.

**Frontend (Codex)**

- [x] Payment confirmation screen uses actual PaymentIntent response.
- [x] Redirect to provider, return route, polling fallback and final paid/failed states.
- [x] Split UI disables reserved/paid items from server state.
- [x] Persist a payment snapshot for success receipt; avoid optimistic “paid” before webhook.

**Acceptance:** repeat tap, browser refresh, repeated webhook and out-of-order webhook cannot charge/close twice.

## Phase 3 — realtime and operational inbox (B3/A2)

- [x] Frontend WebSocket boundary: `apps/web/lib/staff-realtime.ts`.
- [x] Actionable staff inbox UI: unread/seen/resolved states and deep link to table.
- [ ] Authenticated WebSocket/SSE gateway scoped by venue and staff role.
- [ ] Outbox pattern: emit only after transaction commit.
- [ ] Events: bill requested, payment started/succeeded/failed, order updated, table attention.
- [ ] Server supports idempotent `notification.seen/resolved/archived` commands and bounded history.
- [ ] Connection health, reconnect backoff, event deduplication and polling fallback.

**Acceptance:** payment webhook → persisted order state → realtime event → waiter sees one actionable alert in under 5 seconds on staging.

## Phase 4 — owner analytics and QR lifecycle (A3)

- [ ] Aggregation jobs/query layer for daily QR revenue, QR share, average check, tips, closed tables and service timing.
- [ ] Timezone is venue timezone; metrics exclude voided/failed payments.
- [ ] QR generation: opaque rotating token, printable asset, revoke/reissue, access audit.
- [ ] Owner dashboard consumes real API; loading and date-range state are explicit.
- [ ] Export policy and data retention documented.

**Acceptance:** dashboard totals reconcile with paid intents for the same venue/date.

## Phase 5 — quality, security and release engineering

### Automated checks

- [ ] Unit tests: money formatting, split selection, tip validation, webhook idempotency, authorization.
- [ ] API integration tests: auth, tenant isolation, order version conflicts, provider webhook fixtures.
- [ ] Playwright E2E: PIN → order → guest QR → provider test payment → staff realtime → close table.
- [ ] Browser matrix: iOS Safari, Android Chrome, desktop Chrome/Safari at 320/375/390/430/768/1280/1440.
- [ ] Accessibility checks: keyboard, focus, contrast, touch target sizes, reduced motion.

### CI/CD

- [ ] Every PR: install lockfile, lint, typecheck, unit tests, build.
- [ ] Preview deployment for web and API contract test against preview environment.
- [ ] Protected `main`: required review + required checks; no direct push.
- [ ] Versioned migration deployment with backup, forward-only migration rule and rollback guide.

### Security

- [ ] Rate limiting for PIN, public QR and payment creation.
- [ ] CSP, secure cookies/headers, CORS allowlist, CSRF posture documented.
- [ ] QR token entropy and expiry/revocation tested.
- [ ] Log redaction for credentials, payment data and personal data.
- [ ] Dependency audit, secret scan and production access least-privilege review.

## Launch sequence

1. Internal dry-run with provider sandbox and one seeded restaurant.
2. Staging pilot: 10 tables, two waiters, controlled test payments and failure drills.
3. Restaurant pilot: one venue, daily reconciliation, support contact, feature flag for QR payments.
4. Review metrics after 7 days: payment completion, time request→payment, failed payments, support incidents, QR adoption, tips.
5. Expand only after reconciliation has no unexplained discrepancies and P0/P1 issues are closed.

## Working protocol

- One feature branch per bounded capability, small commits, PR with test evidence.
- Contract/API changes are announced in `collaboration/INBOX.md` before frontend consumes them.
- Codex owns web interaction/design/adapters; Claude owns API, DB, payment provider and realtime gateway.
- Any change to money calculation, payment status transition, customer data or auth requires an ADR and both sides’ acknowledgement.
