# @tickethub/payments

Payments microservice: creates Stripe PaymentIntents and drives the purchase saga to
`paid` / `refunded` via verified webhooks. Owns `pgSchema('payments')`
(`payments`, `stripe_events`, `outbox`, `processed_messages`).

## Responsibilities

- **RPC** `payments.createIntent` — RPC-fetches the order amount via `orders.get`, rejects
  anything not `awaiting_payment`, creates a Stripe PaymentIntent (idempotency key = `orderId`),
  upserts the `payments` row.
- **Webhook** `payments.webhook` (raw body forwarded from the gateway) — verifies the Stripe
  signature, dedupes on `stripe_events(stripe_event_id)`, updates the payment status, and emits
  the mapped domain event through the outbox:
  - `payment_intent.succeeded` → `payment.succeeded`
  - `payment_intent.payment_failed` → `payment.failed`
  - `charge.refunded` → `refund.succeeded`
- **Refund consumer** `refund.requested` (from `orders.events`) — idempotent; calls
  `stripe.refunds.create` (idempotency key = `orderId`). If the event omits `paymentIntentId`,
  it's resolved from the local `payments` row. The `charge.refunded` webhook later closes the loop.

Publishing is outbox-only; consumers dedupe via `processed_messages`.

## Local e2e with stripe-cli (test mode only — $0)

Apps run on the host via ts-node; only infra runs in docker-compose. `stripe-cli` in
docker-compose forwards test webhooks to the host gateway on `:3000`.

```bash
# 1. Put a Stripe TEST secret key in .env: STRIPE_SECRET_KEY=sk_test_...
# 2. Boot infra + the webhook forwarder:
docker compose up -d postgres redis rabbitmq stripe-cli

# 3. Copy the whsec_... printed by stripe-cli into .env as STRIPE_WEBHOOK_SECRET, then run:
docker compose logs stripe-cli | grep whsec

# 4. Start gateway, auth, events, orders, payments (ts-node), then:
#    register + login, create an order, POST /payments/intent, and drive a webhook:
stripe trigger payment_intent.succeeded --add payment_intent:metadata.orderId=<orderId>
#    → GET /orders/:id shows "paid".

# 5. Refund: POST /orders/:id/refund  (or)  stripe trigger charge.refunded
#    → GET /orders/:id shows "refunded".
```

The expire-then-pay race (pay after the reservation expired) auto-refunds: `markPaid` sees an
illegal `expired → paid` transition and emits `refund.requested` instead of resurrecting the order.
