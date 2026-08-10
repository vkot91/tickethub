# TicketHub

An event ticketing platform built as a NestJS microservice system: an API gateway, five services,
two Next.js frontends, and the distributed-systems parts ticketing needs — seat locks, a saga with
compensations, a transactional outbox, and idempotent payment webhooks.

```bash
docker compose up -d && pnpm install && pnpm db:reset && pnpm dev
# buyers → http://app.localhost:4000    organizers → http://admin.localhost:4001
```

## Architecture

```
     app.localhost:4000            admin.localhost:4001
      Next.js (buyers)          Next.js (organizer console)
              │                            │
              └──────────── BFF ───────────┘        separate sessions,
                            │                        host-only cookies
                     ┌──────▼───────┐
                     │ API Gateway  │  JWT + RBAC guards, Redis rate limit,
                     └──────┬───────┘  cross-service aggregation
                            │  RabbitMQ RPC
     ┌───────────┬──────────┼──────────┬────────────┐
  ┌──▼───┐  ┌────▼───┐  ┌───▼────┐  ┌──▼──────┐  ┌──▼──────┐
  │ Auth │  │ Shows  │  │ Orders │  │Payments │  │ Tickets │
  └──────┘  └────────┘  └───┬────┘  └──┬──────┘  └──┬──────┘
                            │  saga     │ Stripe    │ QR + PDF → S3
                            │  orchestr.│           │ → email (BullMQ)
     ───────────────────────┴───────────┴───────────┴──────────
        RabbitMQ topic exchange — domain events, all via outbox
        order.paid · payment.succeeded · refund.requested · seat.released
        show.cancelled · ticket.pdfReady · …

  PostgreSQL (schema per service) · Redis (locks, cache, BullMQ) · S3 · SMTP
```

Every service owns its Postgres schema. Data crosses a service boundary only through an RMQ event
or an RPC call — never a JOIN.

## How the hard parts work

**Seat contention.** Reserving is all-or-nothing: `SET NX EX` per seat, and if any one is already
held the whole batch is released ([`redis.service.ts`](packages/redis/src/redis.service.ts)). The
lock is the fast path; the arbiter is a partial unique index over active reservations
([`schema/orders.ts`](packages/db/src/schema/orders.ts)), so an expired lock still cannot produce a
double sale — the loser gets a constraint violation and a 409. Unclaimed seats are freed by a
delayed BullMQ job ([`release.worker.ts`](apps/orders/src/release/release.worker.ts)).
[`k6/oversell.js`](apps/orders/k6/oversell.js) throws concurrent buyers at one seat and asserts a
single winner.

**The saga.** `reserve → pay → issue ticket`, with compensation on every failure path. Order state
lives in one explicit transition table ([`orders.state.ts`](apps/orders/src/orders.state.ts)) and
nothing mutates an order outside it, which is what makes the awkward case tractable: a payment
succeeding _after_ the reservation expired is an illegal `expired → paid` transition, so the saga
emits `refund.requested` instead of resurrecting the order
([`saga.service.ts`](apps/orders/src/saga/saga.service.ts)). `show.cancelled` runs the same
machinery as a mass refund.

**No dual writes.** Events are inserted in the same transaction as the state change; a poller claims
them with `FOR UPDATE SKIP LOCKED` and publishes at-least-once
([`packages/outbox`](packages/outbox/src)). Consumers record handled messages in
`processed_messages` and no-op on replay — the Stripe webhook additionally dedups on Stripe's event
id ([`webhook.service.ts`](apps/payments/src/webhook/webhook.service.ts)).

**Replayable fulfilment.** `order.paid` → RPC for order and show → HMAC-signed QR token → PDF → S3 →
`ticket.pdfReady` → email worker with backoff
([`issue.controller.ts`](apps/tickets/src/issue.controller.ts)). Ticket ids are a deterministic
UUIDv5 of the order id, so a redelivery rewrites the same row and the same S3 object. Check-in
verifies the QR's HMAC and burns the token in one RPC
([`organizer/check-in.service.ts`](apps/tickets/src/organizer/check-in.service.ts)).

## Stack

| Layer                   | Technology                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Backend                 | NestJS, TypeScript, Turborepo + pnpm workspaces                                          |
| Inter-service transport | RabbitMQ (topic exchange, RPC + events, DLX)                                             |
| Database                | PostgreSQL + Drizzle ORM, schema per service, drizzle-kit migrations                     |
| Cache / locks / jobs    | Redis — seat locks, rate limiting, BullMQ                                                |
| Payments                | Stripe (PaymentIntents, signed webhooks, refunds)                                        |
| Frontend                | Next.js 15 App Router, Radix Primitives + `cva`, TanStack Query, react-hook-form         |
| Storage / email         | S3 + SMTP (MinIO / Mailpit locally)                                                      |
| Observability           | nestjs-pino JSON logs with `request_id` propagated across RMQ and BullMQ, Loki + Grafana |
| Testing                 | Jest, Vitest, pglite + real-infra integration suites, k6                                 |
| Local dev               | docker-compose + Traefik (`*.localhost` hostnames)                                       |

## Running it

```bash
docker compose up -d        # Postgres, Redis, RabbitMQ, MinIO, Mailpit, Loki/Grafana, Traefik
pnpm install
pnpm db:reset               # migrate + seed a venue with a real seat map
pnpm dev                    # all services + both frontends
```

| Where                   | URL                         |
| ----------------------- | --------------------------- |
| Buyer site              | http://app.localhost:4000   |
| Organizer console       | http://admin.localhost:4001 |
| Mailpit (ticket emails) | http://localhost:8025       |
| RabbitMQ management     | http://localhost:15672      |
| Grafana (logs)          | http://localhost:3001       |

```bash
pnpm test               # unit suites, coverage gate enforced (80% statements / 70% branches)
pnpm test:integration   # against a throwaway test database + real Redis/RMQ/MinIO
pnpm lint && pnpm build
```

## Repository layout

```
apps/
  gateway/      HTTP → RPC, JWT + RBAC guards, rate limiting, aggregation
  auth/         register / login / refresh, JWT rotation
  shows/        catalog, seat maps, price bands (buyer + organizer surfaces)
  orders/       saga orchestrator, seat reservations, release worker
  payments/     Stripe PaymentIntents, signed webhooks, refunds
  tickets/      QR + PDF issuing, email delivery, organizer check-in
  web-user/     buyer site (Next.js)
  web-organizer/ organizer console (Next.js)
packages/
  contracts/    Zod DTOs + event payloads — the single source of truth
  db/           Drizzle schemas, migrations, seed, test helpers
  outbox/       transactional outbox + SKIP LOCKED poller + inbox dedup
  ui/           Radix-based component kit and design tokens
  web-kit/      BFF proxy, refresh rotation, query client
  common/ config/ env/ redis/ rmq/ mailer/ pdf/ storage/ …
```

## Status

Working end to end: auth, catalog and seat maps, ordering with seat locks and expiry, Stripe
payments with the full saga and refunds, QR/PDF ticket issuing and email delivery, the organizer
console (shows, pricing, sales dashboard, check-in scanner), and both frontends against the real
backend.

Next: AWS deployment (ECS Fargate via CDK), OpenTelemetry traces across the saga, and a k6 flash
sale on a deployed stand.

## Conventions

- A **show** is the ticketed thing people buy seats for; a **price band** is a priced row of a show;
  a **ticket** is the issued admission credential; an **event** is an RMQ message and nothing else.
- Seat labels are one format everywhere — `"<Section> <RowLetter><Seat>"`, from `seatLabel()` in
  `packages/common`. `tickets.tickets.seat_label` is a snapshot of what was sold, not a cache of
  current geometry.
- Renaming an RPC pattern or routing key renames its RabbitMQ queue — a breaking change for a
  running deployment, so it gets called out in the commit message.

Full engineering conventions: [`CLAUDE.md`](CLAUDE.md).
