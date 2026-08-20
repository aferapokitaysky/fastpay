# Контракт frontend ↔ backend

Это рабочий договор. Claude меняет сервер и OpenAPI, Codex меняет клиент; оба не вносят breaking change без записи в `collaboration/DECISIONS.md` и обновления этого файла.

## Базовые соглашения

- JSON keys: `camelCase`; timestamp: ISO-8601 UTC; money: integer `amountKopecks`; в UI форматирование только через `Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' })`.
- Ошибка: `{ "error": { "code": "PAYMENT_SELECTION_STALE", "message": "...", "requestId": "...", "details": {} } }`.
- Изменяющие запросы принимают `Idempotency-Key`; обновления заказа используют `version` и возвращают `409 ORDER_VERSION_CONFLICT` при устаревших данных.
- Публичный токен стола не является пользователем и не открывает staff/owner routes.

## Минимальные endpoint-группы

| Группа | Примеры |
|---|---|
| Public | `GET /v1/public/tables/:token/bill`, `POST /v1/public/tables/:token/payment-intents`, `GET /v1/public/payment-intents/:id` |
| Staff | `POST /v1/staff/session/pin`, `GET /v1/staff/floor`, `POST /v1/staff/tables/:id/orders`, `PATCH /v1/staff/orders/:id`, `POST /v1/staff/orders/:id/request-bill`, `POST /v1/staff/orders/:id/close` |
| Owner | venues, floors, tables, QR export, menu, employees, dashboard metrics, payment config |
| Provider | `POST /v1/webhooks/{provider}` — без browser auth, но с подписью провайдера |

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
