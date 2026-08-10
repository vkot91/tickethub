# TicketHub

A production-shaped event ticketing platform: **an API gateway, five NestJS microservices**, two Next.js frontends,
and the distributed-systems machinery that ticketing actually needs — seat locks, a saga with
compensations, the outbox pattern, and idempotent payment webhooks.

Built to answer one question properly: _what does it take so that two people can never buy the same
seat, and so that money and tickets stay consistent when a step fails halfway?_

```bash
docker compose up -d && pnpm install && pnpm db:reset && pnpm dev
# buyers → http://app.localhost:4000    organizers → http://admin.localhost:4001
```

---

## Why this repo is worth a look

| Claim                               | How it's actually done                                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zero oversell, proven**           | Redis all-or-nothing seat locks + a PostgreSQL partial unique index as the source of truth. A k6 test throws concurrent buyers at one seat and asserts exactly one winner.                                                         |
| **A real saga, with compensations** | `reserve → pay → issue ticket`, and every failure path rolls the previous steps back — including the nasty one: payment landing _after_ the reservation expired triggers an automatic refund instead of resurrecting a dead order. |
| **No dual writes**                  | Services never write to the DB and publish to RabbitMQ in the same breath. Everything goes through a transactional outbox with a `FOR UPDATE SKIP LOCKED` poller; every consumer is idempotent via `processed_messages`.           |
| **Idempotent by construction**      | Stripe webhook dedup, `Idempotency-Key` on order creation, and ticket IDs as deterministic UUIDv5 of the order id — so a redelivery overwrites the same S3 object instead of minting a second ticket.                              |
| **Tested like it matters**          | 175 spec files: Jest units, integration suites against real Postgres/Redis/RabbitMQ/MinIO, Vitest for the frontends, k6 for the oversell race. Coverage gate (80% statements / 70% branches) enforced in CI.                       |
| **Boundaries you can grep**         | One Postgres schema per service, no cross-service JOINs, Zod contracts as the single source of truth, and a buyer/organizer audience seam that makes an unguarded route hard to write by accident.                                 |

---

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

Every service owns its Postgres schema. Data crosses a service boundary **only** through an RMQ
event or an RPC call — never a JOIN.

---

## The interesting parts

Four problems that are genuinely hard, and where the code lives.

### 1. Two buyers, one seat

Grabbing seats is all-or-nothing: `SET NX EX` per seat, and if any one of them is already held the
whole batch is released ([`redis.service.ts`](packages/redis/src/redis.service.ts)). The lock is
only the fast path though — the **real** arbiter is a partial unique index over active reservations
([`schema/orders.ts`](packages/db/src/schema/orders.ts)), so even a lock that expired mid-flight
cannot produce a double sale; the loser gets a constraint violation and a clean 409.

Unclaimed seats don't leak: creating a reservation schedules a delayed BullMQ job that releases it
after 10 minutes ([`release.worker.ts`](apps/orders/src/release/release.worker.ts)).

Proof, not vibes: [`k6/oversell.js`](apps/orders/k6/oversell.js) fires concurrent buyers at a single
seat and asserts exactly one succeeds.

### 2. A saga that survives the ugly races

Order state lives in one place — an explicit transition table
([`orders.state.ts`](apps/orders/src/orders.state.ts)) — and nothing mutates an order outside it.
That is what makes the awkward case tractable: a payment that succeeds _after_ the reservation
already expired is an illegal `expired → paid` transition, so instead of resurrecting the order the
saga emits `refund.requested` and the buyer gets their money back
([`saga.service.ts`](apps/orders/src/saga/saga.service.ts)).

Same machinery covers `show.cancelled` → mass refund of every paid order for that show.

### 3. Never write twice

A service that writes its row and then publishes to RabbitMQ has a window where it can do one and
not the other. So nothing publishes directly: events are inserted in the **same transaction** as the
state change, and a poller claims them with `FOR UPDATE SKIP LOCKED` and publishes at-least-once
([`packages/outbox`](packages/outbox/src)).

At-least-once means duplicates, so every consumer records what it has handled in
`processed_messages` and no-ops on a replay — including the Stripe webhook, which additionally dedups
on Stripe's own event id ([`webhook.service.ts`](apps/payments/src/webhook/webhook.service.ts)).

### 4. Ticket fulfilment that can be replayed

`order.paid` → fetch the order and show over RPC → HMAC-signed QR token → PDF → S3 → `ticket.pdfReady`
→ BullMQ email worker with exponential backoff
([`issue.controller.ts`](apps/tickets/src/issue.controller.ts)).

The ticket id is a deterministic **UUIDv5 of the order id**, so a redelivered `order.paid` rewrites
exactly the same row and the same S3 object rather than issuing a second ticket. The organizer's
check-in scanner verifies the QR's HMAC and burns the token in one RPC
([`organizer/check-in.service.ts`](apps/tickets/src/organizer/check-in.service.ts)).

---

## Design decisions I'd defend in an interview

- **Audience folders over role checks.** Every app that serves both buyers and organizers splits
  `src/user/` and `src/organizer/`, with wire keys named `<audience>.<resource>.<action>`
  (`user.orders.create`, `organizer.shows.updatePricing`). A file is never half public catalog and
  half authenticated authoring — that's how routes end up unguarded. It's also greppable: no file
  under `user/` may mention `organizer.`, and vice versa.
- **Contracts as one source of truth.** [`packages/contracts`](packages/contracts/src) holds Zod
  schemas for every DTO and event payload, split service-then-audience. A schema is exported from the
  barrel **iff** someone calls `.parse()` on it, so the barrel advertises exactly the validation
  surface that exists.
- **A hand-written UI kit, not shadcn/ui.** [`packages/ui`](packages/ui/src) wraps Radix Primitives
  with `cva` variants — shadcn-style by construction, but no registry copies to drift and no second
  system (Radix Themes) fighting the design tokens for ownership of colour and spacing.
- **Two frontends, never one session.** Buyers and organizers get separate hostnames, host-only
  cookies and distinct cookie names — the console cannot inherit a buyer session.
- **Forms are react-hook-form + Zod resolver** through the UI package's form layer, with contract
  schemas reused when the input shape matches the wire shape and a local `.transform()` schema when
  it doesn't. The wire schema is never relaxed to please a widget.

---

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

---

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
pnpm test               # unit suites, coverage gate enforced
pnpm test:integration   # against a throwaway test database + real Redis/RMQ/MinIO
pnpm lint && pnpm build
```

---

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

---

## Status

Working end to end today: auth, catalog and seat maps, ordering with seat locks and expiry, Stripe
payments with the full saga and refunds, QR/PDF ticket issuing and email delivery, the organizer
console (shows, pricing, sales dashboard, check-in scanner), and both frontends against the real
backend.

Next up: AWS deployment (ECS Fargate via CDK), OpenTelemetry traces across the saga, and a k6 flash
sale on a deployed stand with p95/p99 numbers reported here.

---

## Conventions worth knowing before you "fix" them

- **Naming is deliberate.** A **show** is the ticketed thing people buy seats for; a **price band**
  is a priced row of a show; a **ticket** is the issued admission credential; an **event** is an RMQ
  message and nothing else. Never "event" for the domain object.
- **Seat labels** are one format everywhere — `"<Section> <RowLetter><Seat>"`, e.g. `"Parterre A2"`,
  from `seatLabel()` in `packages/common`. `tickets.tickets.seat_label` is a **snapshot of what was
  sold**, not a cache of current geometry — a reshuffled seat map does not rewrite issued tickets
  (unlike the show title and start time, which are read live).
- Renaming an RPC pattern or routing key renames its RabbitMQ queue — a breaking change for a running
  deployment, so it gets called out in the commit message.

Full engineering conventions: [`CLAUDE.md`](CLAUDE.md).
