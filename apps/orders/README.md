# @tickethub/orders

Order flow with real concurrency control. Two clients can never buy the same seat;
unpaid reservations expire after 10 minutes; every state change is published via the
transactional outbox.

## Concurrency barriers (defense in depth)

1. Gateway rate-limit (existing).
2. Redis `SET NX` seat locks — cheap rejection before touching Postgres.
3. **Partial-unique index** `seat_res_active_uq` on `(event_id, seat_id) WHERE status IN ('held','confirmed')` — the source of truth. Even if Redis is bypassed, a second active hold on a seat cannot be inserted.

## RPC (via the gateway)

| HTTP (gateway)            | RPC pattern            | Notes                                    |
| ------------------------- | ---------------------- | ---------------------------------------- |
| `POST /orders`            | `orders.create`        | Auth + `Idempotency-Key` header required |
| `GET /orders/:id`         | `orders.get`           | Owner only                               |
| `POST /orders/:id/refund` | `orders.requestRefund` | Owner only; order must be `paid`         |

## Saga consumers (Phase 3)

Orders is a hybrid app: besides `orders.rpc` it consumes `payments.events`
(`payment.succeeded → markPaid`, `payment.failed → markFailed`, `refund.succeeded → markRefunded`)
and `catalog.events` (`event.cancelled → refundAllPaidForEvent`). Every transition goes through the
`order-state` machine, so an out-of-order `payment.succeeded` on an already-`expired` order emits
`refund.requested` instead of resurrecting it (the expire-then-pay race). The Phase 2 `confirmTest`
hook is retired.

## Events (outbox → RabbitMQ, `orders.events`, with DLX)

`order.awaiting_payment`, `order.paid`, `order.expired`, `order.cancelled`, `refund.requested`,
`seat.held`, `seat.released`, `seat.confirmed`.

## Config

`DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `RESERVATION_TTL_SEC` (default `600`).

## Run

```bash
docker compose up -d postgres redis rabbitmq      # infra
pnpm --filter @tickethub/db db:migrate && pnpm db:seed
pnpm --filter @tickethub/orders dev               # host process (like the other services)
```

## Tests

```bash
pnpm --filter @tickethub/orders test              # unit (pglite-free, fakes) — coverage-gated
# integration needs real PG + Redis in the shell env:
set -a; source .env; set +a
pnpm --filter @tickethub/orders test:integration  # oversell + expiry + confirm, real infra
```

## k6 oversell load test

Seed first, grab a token and the flash-sale ids from the seed output, then:

```bash
TOKEN=$(curl -s -XPOST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"user@tickethub.dev","password":"password123"}' | jq -r .accessToken)
k6 run -e TOKEN=$TOKEN -e EVENT_ID=$FLASH_EVENT -e SEAT_ID=$FLASH_SEAT -e TT_ID=$FLASH_TT \
  apps/orders/k6/oversell.js
```

Expect `oversell check: PASS (winners=1)` and p95 < 500ms. The seat must be free at the
start of the run (freshly seeded, or after a prior reservation expired).
