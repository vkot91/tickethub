# @tickethub/fulfillment

Fulfillment microservice: turns a paid order into QR-stamped PDF tickets in object storage, emails
them to the buyer, and serves the buyer's ticket list. Owns `pgSchema('fulfillment')` (`tickets`,
`outbox`, `processed_messages`).

**One ticket = one seat.** A three-seat order mints three rows, each with its own QR token and its
own `checked_in_at`, because a ticket is what a gate scanner admits. They share a single PDF
document (one page per seat) at one S3 key.

Two RMQ subscribers, two RPC handlers and one BullMQ worker — **no HTTP port** (`main.ts` calls
`app.init()`, golevelup discovers the handlers by module scanning).

Object storage, SMTP and PDF mechanics live in `@tickethub/storage`, `@tickethub/mailer` and
`@tickethub/pdf`. What stays here is the domain: the ticket layout, the QR signing, the email
template and the delivery/retry policy.

## Responsibilities

- **Consumer** `order.paid` (queue `fulfillment.order-paid` + DLX) — renders and stores the ticket:
  1. RPC `orders.get` (seats on the order), `shows.detail` (title + start time),
     `shows.seatMap` (seat id → `Section Row-Seat` label).
  2. `ticketId = sha256(orderId:seatId)` as a v5-shaped uuid — **derived, not random**. The PDF is
     rendered and its tokens signed _before_ the rows are inserted, so a random id would let a
     redelivery write a second document (over the same key) carrying tokens that match nothing in
     the database. Deriving makes every retry re-sign identical tokens.
  3. QR payload = `ticketId.HMAC-SHA256(ticketId, TICKET_QR_SECRET)` (base64url), one per seat,
     rendered to PNG and embedded on that seat's A5 page. Text is drawn in a subsetted DejaVu Sans
     vendored in `@tickethub/pdf` — the built-in Helvetica is WinAnsi-only and throws on a Cyrillic
     title.
  4. `PUT s3://$S3_BUCKET_TICKETS/<orderId>.pdf` — one document, a page per seat. A re-put
     overwrites instead of littering the bucket.
  5. One transaction: claim `processed_messages`, insert the `tickets` rows
     (`onConflictDoNothing` against `tickets_order_seat_uq`), enqueue `ticket.pdf_ready` in the
     outbox. No rows inserted → no second event, no duplicate email.
- **Consumer** `ticket.pdf_ready` (queue `fulfillment.ticket-pdf-ready` + DLX) — claims
  `processed_messages` and adds a BullMQ `send-ticket-email` job with `jobId = orderId`, both in the
  same transaction. Biases at-least-once email over at-most-once: a duplicate beats a missing ticket.
- **BullMQ worker** `send-ticket-email` (5 attempts, exponential backoff from 2 s) — RPC
  `auth.getUser` for the address, `GET` the PDF back from S3, send via SMTP with the PDF attached.
  Failures propagate on purpose so BullMQ retries.
- **RPC** `tickets.list` — the caller's tickets, newest first. `showTitle`/`showStartsAt` are
  fetched from `shows.detail` (once per distinct show), never snapshotted, so a rescheduled show
  displays its new date. `seatLabel` and `tier` _are_ snapshotted: they are what was sold.
- **RPC** `tickets.pdfUrl` — checks ownership and mints a **60-second presigned S3 URL**. The list
  carries a stable `/tickets/:id/pdf` path instead, which the gateway 302s to a URL minted at click
  time: authorization happens on the click, not when the page was rendered, and no perishable
  credential ever lands in a cacheable response.

Publishing is outbox-only (`OutboxPoller` → `EVENTS_EXCHANGE`); both consumers dedupe via
`processed_messages`.

## Env vars (`src/config.ts`)

| Var                               | What it is                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Postgres — the `fulfillment` schema                                                   |
| `RABBITMQ_URL`                    | RMQ: two subscriber queues, the RPC calls, and the outbox publisher                   |
| `REDIS_URL`                       | BullMQ connection for the `send-ticket-email` queue/worker                            |
| `S3_ENDPOINT`                     | MinIO/S3 endpoint (path-style addressing)                                             |
| `S3_PUBLIC_ENDPOINT`              | Browser-reachable endpoint used **only** for presigning (SigV4 covers `host`)         |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Object-storage credentials                                                            |
| `S3_BUCKET_TICKETS`               | Bucket the ticket PDFs live in (`tickets` locally)                                    |
| `SMTP_HOST` / `SMTP_PORT`         | SMTP relay — Mailpit locally (`localhost:1025`), SES in prod                          |
| `MAIL_FROM`                       | Envelope/From address of the ticket email                                             |
| `TICKET_QR_SECRET`                | HMAC key the QR token is signed with, min 32 chars (rotating it invalidates every QR) |
| `NODE_ENV`                        | `development` by default; flips pino from pretty to JSON                              |

## Manual e2e (paid order → PDF email)

```bash
# 1. Infra
docker compose up -d postgres redis rabbitmq minio minio-setup mailpit stripe-cli
pnpm --filter @tickethub/db db:migrate && pnpm db:seed

# 2. Copy the whsec_… printed by stripe-cli into .env as STRIPE_WEBHOOK_SECRET
docker compose logs stripe-cli | grep whsec

# 3. Apps on the host (ts-node, one terminal each, from the app directory)
#    auth, shows, orders, payments, gateway, fulfillment:
node --watch -r ts-node/register src/main.ts

# 4. Buy something
curl -sX POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"e2e@tickethub.dev","password":"password123"}'
TOKEN=$(curl -sX POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"e2e@tickethub.dev","password":"password123"}' | jq -r .accessToken)

#    seat ids + ticketTypeId come from the seeded "Demo Concert (seated)" show:
curl -s localhost:3000/shows/<showId>/seat-map | jq

curl -sX POST localhost:3000/orders -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'idempotency-key: e2e-1' \
  -d '{"showId":"<showId>","seats":[{"seatId":"<seatId>","ticketTypeId":"<ticketTypeId>"}]}'

curl -sX POST localhost:3000/payments/intent -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"orderId":"<orderId>"}'

# 5. Drive the webhook (the host has no stripe binary — use the container)
docker compose exec stripe-cli stripe trigger payment_intent.succeeded \
  --add payment_intent:metadata.orderId=<orderId>

# 6. Evidence
curl -s 'localhost:8025/api/v1/messages?limit=5' | jq '.total, .messages[0].Subject'
curl -s localhost:8025/api/v1/message/<id> | jq '.Attachments'
curl -s -o ticket.pdf localhost:8025/api/v1/message/<id>/part/2 && head -c 5 ticket.pdf  # %PDF-
```

Mailpit's UI is at <http://localhost:8025>; the MinIO console at <http://localhost:9001>.

### Recorded result — 2026-07-22, **route A (full Stripe flow)**

Ran exactly as above against the seeded `Demo Concert (seated)` show, two seats (Parterre 1-3 and
1-4), order `8007f42b-ddce-450c-a48b-e018cc7729e8`:

- `GET /orders/:id` → `"status":"paid"`, both seat reservations `confirmed`.
- `fulfillment.tickets` → **exactly one** row, `id = order_id`,
  `s3_key = 8007f42b-….pdf`, `qr_token` re-verified against `TICKET_QR_SECRET` out of band.
  (Recorded before the per-seat regrain — the same run today mints one row per seat, each with its
  own `qr_token`, still one object and one email.)
- `fulfillment.outbox` → one `ticket.pdf_ready` row with `published_at` set.
- `fulfillment.processed_messages` → two rows (`order.paid` and `ticket.pdf_ready`).
- MinIO `tickets` bucket → **exactly one** object, `8007f42b-….pdf`.
- Mailpit → one message, `Your TicketHub ticket`, from `tickets@tickethub.local` to the buyer, with
  attachment `ticket-8007f42b-….pdf` (`application/pdf`, 15717 B). The downloaded part starts with
  `%PDF-1.7` and ends with `%%EOF`; `pdftotext` on it reads:

  ```
  TicketHub
  Demo Concert (seated)
  Tue, 01 Dec 2026 19:00:00 GMT
  Order: 8007f42b-ddce-450c-a48b-e018cc7729e8
  Seats: Parterre 1-3, Parterre 1-4
  ```

Re-triggering the same `payment_intent.succeeded` afterwards changed nothing: still one ticket row,
one outbox row, one object, one email.

Gotcha worth remembering: leftover service processes from an earlier session still hold their RMQ
bindings, so a single `POST /orders` can be handled twice — the first attempt takes the Redis seat
lock and creates the order, the second answers `409 One or more seats are being held by another
buyer`, and the gateway returns whichever reply lands first. Symptom: an HTTP error next to a row
that clearly exists in `orders.orders`. Run `ps -eo pid,command | grep main.ts` and kill the strays
before blaming the code.
