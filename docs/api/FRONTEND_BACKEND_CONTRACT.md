# Контракт frontend ↔ backend

Это рабочий договор. Claude меняет сервер и OpenAPI, Codex меняет клиент; оба не вносят breaking change без записи в `collaboration/DECISIONS.md` и обновления этого файла.

## Базовые соглашения

- JSON keys: `camelCase`; timestamp: ISO-8601 UTC; money: integer `amountKopecks`.
- Форматирование денег в UI — **не** `Intl.NumberFormat(..., { style: 'currency' })` напрямую: символ гривны зависит от версии ICU (Node на SSR и Chromium на клиенте могут отдать разное — `₴` vs `грн`), что даёт hydration mismatch. Используй `formatToParts()` и подставляй `₴` только вместо части `type: "currency"` — см. `apps/web/lib/money.ts` (это уже так реализовано, здесь фиксируется как обязательное правило, а не предложение).
- Ошибка: `{ "error": { "code": "...", "message": "...", "requestId": "...", "details": {} } }` — единая форма для всех эндпоинтов, реализована в `apps/api/src/middleware/errorHandler.ts`.
- Изменяющие запросы к заказу (`PATCH .../orders/:id`, `.../request-bill`, `.../close`) принимают `version` в теле и возвращают `409 ORDER_VERSION_CONFLICT` (с `details.currentOrder` — актуальным состоянием) при устаревшей версии.
- Все staff/owner-эндпоинты требуют `Authorization: Bearer <token>` (см. раздел Auth) и всегда фильтруются по `organizationId` из сессии — чужой tenant отдаёт `404`, не `403` (403 — только когда сотрудник аутентифицирован в своей организации, но не имеет роли/venue для конкретного действия).
- Публичный QR-токен стола не является пользовательской сессией и не открывает staff/owner routes.

## Auth

Сессия — непрозрачный bearer-токен (32 случайных байта, base64url), хранится в Redis, TTL 12 часов, sliding (продлевается на каждый аутентифицированный запрос). Роли: `owner` (вся организация, `venueId: null`), `manager` и `waiter` (закреплены за одним `venueId`).

| Метод и путь | Кто | Тело запроса | Ответ |
|---|---|---|---|
| `POST /v1/owner/register` | публично | `{ organizationName, venueName, email, password }` | `201` `StaffSessionResponse & { organizationId, venueId }` — создаёт организацию + первый venue + owner-аккаунт одной транзакцией |
| `POST /v1/staff/session/password` | публично | `{ email, password }` | `200` `StaffSessionResponse`; `401 INVALID_CREDENTIALS`; `429 RATE_LIMITED` после 5 неудачных попыток за 15 мин (ключ: email+IP) |
| `POST /v1/staff/session/pin` | публично | `{ venueId, pin }` | `200` `StaffSessionResponse`; `401 INVALID_CREDENTIALS`; `429 RATE_LIMITED` (ключ: venueId+IP) — PIN 4-6 цифр, официант логинится без email |
| `POST /v1/staff/session/logout` | staff (любая роль) | — | `204` — инвалидирует токен немедленно |

`StaffSessionResponse`: `{ token, expiresAt, staff: { id, name, role, organizationId, venueId } }`.

## Public (без аутентификации, по QR-токену стола)

| Метод и путь | Ответ |
|---|---|
| `GET /v1/public/tables/:token/bill` | `200` `PublicBillResponse` (см. пример ниже, `order: null` = нет активного заказа); `404 TABLE_NOT_FOUND` для неизвестного/отозванного токена |

## Staff (аутентификация обязательна; `owner`/`manager` где указано, иначе — любая роль своего venue)

| Метод и путь | Роль | Тело запроса | Ответ |
|---|---|---|---|
| `POST /v1/staff/venues` | owner/manager | `{ name, logoUrl? }` | `201 StaffVenue` |
| `GET /v1/staff/venues` | owner/manager | — | `200 { venues: StaffVenue[] }` |
| `GET /v1/staff/venues/:id` | owner/manager | — | `200 StaffVenue`; `404 VENUE_NOT_FOUND` |
| `PATCH /v1/staff/venues/:id` | owner/manager | `{ name?, logoUrl? }` | `200 StaffVenue` |
| `POST /v1/staff/venues/:venueId/floors` | owner/manager | `{ name }` | `201 StaffFloor` |
| `GET /v1/staff/venues/:venueId/floors` | owner/manager | — | `200 { floors: StaffFloor[] }` |
| `PATCH /v1/staff/floors/:id` | owner/manager | `{ name? }` | `200 StaffFloor`; `404 FLOOR_NOT_FOUND` |
| `POST /v1/staff/floors/:floorId/tables` | owner/manager | `{ label }` | `201 StaffTable` (генерирует случайный `qrToken`) |
| `GET /v1/staff/floors/:floorId/tables` | owner/manager | — | `200 { tables: StaffTable[] }` |
| `PATCH /v1/staff/tables/:id` | owner/manager | `{ label? }` | `200 StaffTable`; `404 TABLE_NOT_FOUND` |
| `POST /v1/staff/tables/:id/rotate-qr` | owner/manager | — | `200 StaffTable` — новый `qrToken`, старый инвалидируется немедленно, пишет `audit_events` |
| `POST /v1/staff/venues/:venueId/menu-items` | owner/manager | `{ name, unitPriceKopecks }` | `201 StaffMenuItem` |
| `GET /v1/staff/venues/:venueId/menu-items` | owner/manager | — | `200 { menuItems: StaffMenuItem[] }` |
| `PATCH /v1/staff/menu-items/:id` | owner/manager | `{ name?, unitPriceKopecks? }` | `200 StaffMenuItem` — смена цены НЕ трогает `unitPriceKopecksSnapshot` уже созданных `order_items`, пишет `audit_events` |
| `POST /v1/staff/employees` | owner/manager | `{ name, role: "manager"\|"waiter", venueId, email?, password?, pin? }` (manager требует email+password, waiter требует pin) | `201 StaffEmployee`; `409 PIN_ALREADY_IN_USE`; `409 EMAIL_ALREADY_EXISTS`; `400` при нарушении требований роли |
| `GET /v1/staff/employees` | owner/manager | — | `200 { employees: StaffEmployee[] }` |
| `PATCH /v1/staff/employees/:id` | owner/manager | `{ name?, role?, venueId?, password?, pin? }` | `200 StaffEmployee`; `409 CANNOT_MODIFY_OWNER` для owner-строки |
| `POST /v1/staff/tables/:id/orders` | любая роль своего venue | — | `201 StaffOrder` (`status: "open"`, `version: 1`); `409 TABLE_HAS_ACTIVE_ORDER` если на столе уже есть незакрытый заказ (гонка защищена partial unique index на уровне БД) |
| `PATCH /v1/staff/orders/:id` | любая роль своего venue | `{ version, operations: [{ type: "add", menuItemId, quantity, comment? } \| { type: "update", orderItemId, quantity?, comment? } \| { type: "remove", orderItemId }] }` | `200 StaffOrder`; `409 ORDER_VERSION_CONFLICT`; `409 ORDER_NOT_EDITABLE` вне `open`/`bill_requested` |
| `POST /v1/staff/orders/:id/request-bill` | любая роль своего venue | `{ version }` | `200 StaffOrder` (`status: "bill_requested"`); `409 INVALID_ORDER_TRANSITION` если статус не `open` |
| `POST /v1/staff/orders/:id/close` | любая роль своего venue | `{ version, reason? }` | `200 StaffOrder` (`status: "closed"`). Waiter с ненулевым `outstandingFoodKopecks` получает `403 FORBIDDEN`; manager/owner обязаны передать `reason` (`400 CLOSE_REASON_REQUIRED` без него) — пишет `audit_events` (`order.closed_with_balance`). `409 ORDER_ALREADY_CLOSED` для повторного закрытия |

`StaffOrder`: `{ id, tableId, status, version, items: StaffOrderItem[], totalFoodKopecks, outstandingFoodKopecks, currency, createdAt, updatedAt }` — считается на сервере из снапшотов позиций при каждом чтении/записи, клиентской сумме не доверяем. Полный `status`-enum: `draft | open | bill_requested | payment_pending | partially_paid | paid | closed` (публичный контракт не показывает `closed`).

## Provider (эквайринг, следующий этап — B2)

`POST /v1/webhooks/{provider}` ещё не реализован. PaymentIntent, чаевые как отдельная сущность и связанные payment-эндпоинты — это B2, не в этом контракте.

## Обязательный public bill response

```json
{
  "venue": { "name": "Goodman", "logoUrl": null },
  "table": { "label": "02" },
  "order": {
    "id": "opaque-public-id",
    "status": "bill_requested",
    "version": 12,
    "items": [{ "id": "public-item-id", "name": "Бургер", "quantity": 1, "unitPriceKopecks": 32000, "remainingKopecks": 32000, "paymentStatus": "unpaid" }],
    "outstandingFoodKopecks": 124000,
    "currency": "UAH",
    "updatedAt": "2026-08-20T12:00:00Z"
  },
  "tips": { "percentOptions": [5, 10, 15], "customAllowed": true }
}
```

Перед первой реализацией Claude публикует точную OpenAPI-спецификацию в `packages/contracts`; Codex не хардкодит mock response в production code.
