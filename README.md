# TicketHub

Event ticketing platform. Pet project for training skills: microservices, queues, distributed transactions, concurrent access.

## Stack

| Layer                      | Technologies                                                   |
| -------------------------- | -------------------------------------------------------------- |
| Backend                    | NestJS (monorepo, Turborepo + pnpm workspaces), TypeScript     |
| Inter-service transport    | RabbitMQ (topic exchange)                                      |
| Internal jobs              | BullMQ (Redis)                                                 |
| Database                   | PostgreSQL + Drizzle ORM (drizzle-kit migrations)              |
| Cache / locks / rate limit | Redis                                                          |
| Payments                   | Stripe (test mode)                                             |
| Serverless                 | AWS Lambda (QR/PDF tickets, image resize)                      |
| Storage / Email            | S3, SES                                                        |
| Frontend                   | Next.js 15 (App Router), shadcn/ui, TanStack Query             |
| Real-time                  | WebSockets (Socket.IO gateway) + Redis pub/sub                 |
| Logs / errors              | nestjs-pino (request_id across services), Sentry, Grafana Loki |
| Local development          | docker-compose + MinIO (S3) / Mailpit (email)                  |
| Deployment                 | AWS ECS Fargate                                                |
| Load testing               | k6                                                             |

## Key scenarios

1. **Flash sale** — 1000 users for 100 tickets: seat locks in Redis, queue, zero oversell.
2. **Saga with compensation** — reserve seats → payment → issue tickets; failure at any step rolls back the previous ones.
3. **Idempotent Stripe webhooks** — duplicates and out-of-order events don't corrupt state.
4. **Eventual consistency** — outbox pattern + RabbitMQ, no distributed transactions across services.

## Conventions worth knowing before you "fix" them

- **Seat labels** are one format everywhere — `"<Section> <RowLetter><Seat>"`, e.g. `"Parterre A2"`,
  from `seatLabel()` in `packages/common`. Tickets issued before it was unified keep their old
  `"Parterre 1-1"` value: `fulfillment.tickets.seat_label` is a **snapshot of what was sold**, not a
  cache of the current geometry, so there is deliberately no backfill.
