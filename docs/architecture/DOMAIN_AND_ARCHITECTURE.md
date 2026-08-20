# Архитектура и доменная модель

## Границы приложений

```text
apps/web                 PWA: guest, staff, owner UI
apps/api                 REST/OpenAPI + real-time + payment webhooks
packages/contracts       DTO, OpenAPI artifacts, shared domain enums
packages/ui              UI primitives только для frontend
docs/api                 человекочитаемые правила контракта
collaboration            асинхронная координация Codex ↔ Claude
```

Backend является единственным источником правды по заказам, суммам, резервам и оплатам. Frontend может делать optimistic UI, но обязан принять серверное состояние после ответа/события. Эквайрер подтверждает деньги webhook-событием; browser redirect — только UX-сигнал.

## Поток успешной оплаты

```text
Guest PWA → POST payment-intents → API transaction/reservation → Provider invoice
Guest PWA → Provider checkout
Provider → signed webhook → API idempotent transaction → DB + outbox
Outbox → realtime gateway → Staff PWA / Guest PWA
```

## Требования к транзакциям

1. Сервер пересчитывает итог по снапшотам позиций.
2. Reservation и PaymentIntent создаются в одной транзакции.
3. Успешный webhook в одной транзакции фиксирует payment, allocations и состояния заказа.
4. Публикация realtime-события идёт через outbox после commit.
5. Любой повтор входящего webhook не меняет балансы повторно.
