# TicketHub — project instructions

Pet project for training skills: NestJS microservices, queues, distributed
transactions (saga + outbox), concurrency.

## Testing (non-negotiable)

- **Every package, app, and service is covered by unit tests.** No package ships untested.
- **TDD**: write the failing test before the implementation (see `superpowers:test-driven-development`).
- Jest for unit tests; testcontainers for integration (repos, outbox poller, consumers);
  supertest + docker-compose for e2e saga flows; k6 for load (flash-sale / oversell).
- Coverage gate in `turbo test` / CI — aim high on domain logic (order state machine,
  saga compensations, idempotency, seat-lock paths). Trivial glue code excepted.
- A phase is not "done" until its tests are green and `docker-compose up` boots from a clean clone.

## Conventions

- Monorepo: Turborepo + pnpm workspaces. Deps via `workspace:*`.
- Naming: **show** = the ticketed thing people buy seats for (`apps/shows`, PG schema `shows`,
  `showId`, routing keys `show.published`/`show.cancelled`). **event** = an RMQ message, and
  nothing else (`EVENTS_EXCHANGE`, `publishEvent`, `PaymentSucceededEvent`). Never use "event"
  for the domain object.
- `packages/contracts` (Zod) is the single source of truth for DTOs and RMQ event shapes.
- Contract constants are **flat**: one exported `const` per concern, named `<SCOPE>_<KIND>`
  (`AUTH_MESSAGE_PATTERNS`, `SHOWS_MESSAGE_PATTERNS`, `RPC_QUEUES`, `EVENTS_QUEUES`,
  `SHOW_ROUTING_KEYS`). No nested grouping object (`MESSAGE_PATTERNS.auth.login`) — one level
  only, so the import line says which scope a file talks to. Keys are `SCREAMING_SNAKE` for
  message patterns and queues; routing-key maps keep `camelCase` keys that mirror the wire
  value (`showCancelled: 'show.cancelled'`). Every map ends with `as const`.
- Per-service Postgres schema via Drizzle `pgSchema()`. No cross-service JOINs — data crosses
  service boundaries only via RMQ events or RPC.
- Events published only through the outbox pattern; consumers are idempotent (`processed_messages`).
- Structured logs (nestjs-pino JSON) with `request_id` propagated through RMQ/BullMQ from Phase 1.
- Env config: `@tickethub/env` (zero-dep) is the single home for `loadEnv`/`requireEnv`, used by non-Nest
  code (drizzle-kit/seed, rmq). `@tickethub/config` is the Nest façade — `configModuleFor(schema)` (global,
  fail-fast Zod-validated `ConfigModule`) plus re-exported `loadEnv`/`requireEnv`/`ConfigService` so apps
  import all config from one place (not `@nestjs/config` directly). Per-app `src/config.ts` exports only its
  own Zod `schema` + `Config` type (no shared mega-schema — each service validates just its vars). Modules
  `imports: [configModuleFor(schema)]` and read via injected `ConfigService<Config, true>` (`registerAsync`+
  `inject` for dynamic modules). `main.ts` calls `loadEnv()` then `schema.parse(process.env)` for bootstrap
  values. No `process.env.X ?? 'default'`, no module-scope config singletons.
