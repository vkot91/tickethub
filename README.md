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
