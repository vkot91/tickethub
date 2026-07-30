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
- Integration suites run against the **throwaway `TEST_DATABASE_URL` database, never the dev one**
  — they TRUNCATE and re-seed on every run. Wiring: `--setupFiles @tickethub/db/testing/integration-env`
  in each `test:integration` script repoints `DATABASE_URL` before any spec body runs. Run the lot with
  `pnpm test:integration` (migrates the test db first, then runs the suites serially — they share it).
  A new `*.integration.spec.ts` in a db-backed package needs no extra wiring; a new _package_ must copy
  the `test:integration` script.
- A phase is not "done" until its tests are green and `docker-compose up` boots from a clean clone.

## Conventions

- Monorepo: Turborepo + pnpm workspaces. Deps via `workspace:*`.
- Naming: **show** = the ticketed thing people buy seats for (`apps/shows`, PG schema `shows`,
  `showId`, routing keys `show.published`/`show.cancelled`). **event** = an RMQ message, and
  nothing else (`EVENTS_EXCHANGE`, `publishEvent`, `PaymentSucceededEvent`). Never use "event"
  for the domain object.
- `packages/contracts` (Zod) is the single source of truth for DTOs and RMQ event shapes.
- `design/` is the single source of truth for UI: `design/README.md` (screens, tokens, behavior)
  and `design/TicketHub.dc.html` (interactive prototype, source project on claude.ai/design).
  Read it before building any frontend screen; recreate with shadcn/ui + Tailwind at high
  fidelity — never port its raw HTML/inline styles. Colors, type, radii, and motion come from
  its token list via CSS variables, not hardcoded per component. The handoff predates the
  `show` naming rule — its `events/[id]` routes and `GET /events/...` endpoints map to `shows`.
- Two frontends: `apps/web-user` (buyers) and `apps/web-organizer` (the console). They share `packages/ui`
  (presentational components + design tokens) and `packages/web-kit` (BFF proxy, refresh rotation,
  query client) and **nothing else** — app-specific code never goes in a package.
- The two never share a session. Dev URLs are `http://app.localhost:4000` and
  `http://admin.localhost:4001` — separate hostnames, matching the `app.`/`admin.` subdomains in
  production, with host-only cookies (no `Domain`) and per-app names (`th_*` vs `tho_*`).
- UI primitives are **Radix-based**: everything in `packages/ui/src/` wraps a
  `@radix-ui/react-*` primitive (shadcn/ui's own foundation) rather than a bare HTML element —
  `Slot` for `asChild` composition, `Label`, `Dialog`, `Toast`, `Progress`, `Select`, `Tabs`.
  Radix owns behavior and accessibility (focus, keyboard, ARIA); we own only the `cva` variants
  that map design tokens onto it. Do not hand-roll a control Radix already ships.
- **Audience folders in every app that serves more than one.** `src/user/` is buyer-facing
  (`apps/web-user`), `src/organizer/` is the console (`apps/web-organizer`), `src/shared/` holds only
  what both genuinely use — and is not created until something does. **Folder is the audience, file is
  the resource, class is `<Audience><Resource><Kind>`**: `organizer/shows.controller.ts` →
  `OrganizerShowsController`, `user/shows.controller.ts` → `UserShowsController`. Both may talk to the
  same tables; they are different files because they serve different callers, return different shapes
  and carry different guards. A file is never half public catalog and half authenticated authoring —
  that is how a route ends up unguarded. Applies to `apps/gateway` and `apps/shows` today, and to any
  service the console reaches into next (`apps/orders` stats, `apps/fulfillment` check-in).
  RPC pattern maps follow the same seam: `SHOWS_MESSAGE_PATTERNS` is the buyer catalog surface,
  `ORGANIZER_SHOWS_MESSAGE_PATTERNS` the console's — one map per audience surface, never one map
  mixing both.
- **`packages/contracts` splits service-then-audience.** One folder per owning service; inside it
  `schema.ts` (only what both audiences extend), `events.ts` (routing keys + payloads — events have
  no audience, every consumer is another service), and one folder per audience carrying its own
  `schema.ts` + `wire.ts`: `shows/user/wire.ts` is the buyer catalog, `shows/organizer/wire.ts` the
  console. The service is outer because it is the deploy seam; the audience is inner because it is
  what decides the guard. A stats shape then has nowhere to land but an `organizer/` folder, and a
  map cannot quietly grow a second audience's key — which `ORDERS_MESSAGE_PATTERNS.STATS` once did.
  A service with one audience (`auth`, `venues`, `payments`) has no subfolders; add them when a
  second audience actually turns up. Top-level `organizer/` is the organizer _resource_ — the
  account, plus the dashboard shapes the gateway stitches from three services and no one folder owns.
- **Wire values are `<audience>.<service>.<action>`**, with the buyer unprefixed as the default
  audience: `shows.catalog` and `orders.create`, but `organizer.shows.putPricing`,
  `organizer.orders.stats`, `organizer.profile.create`. Audience first because it decides the guard,
  service second because it decides the queue. `admin.*` slots in as a sibling with nothing to
  rethink. Action names never repeat their map (`ORGANIZER_SHOWS_MESSAGE_PATTERNS.GET`, not
  `.GET_SHOW`). Renaming one of these renames its RMQ queue — a breaking change for a running
  deployment, so say so in the commit.
- Contract constants are **flat**: one exported `const` per concern, named `<SCOPE>_<KIND>`
  (`AUTH_MESSAGE_PATTERNS`, `SHOWS_MESSAGE_PATTERNS`, `RPC_QUEUES`, `EVENTS_QUEUES`,
  `SHOW_ROUTING_KEYS`). No nested grouping object (`MESSAGE_PATTERNS.auth.login`) — one level
  only, so the import line says which scope a file talks to. Keys are `SCREAMING_SNAKE`
  throughout — message patterns, queues, and routing-key maps alike, each key mirroring its
  wire value (`SHOW_CANCELLED: 'show.cancelled'`). Every map ends with `as const`.
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
