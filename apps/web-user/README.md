# @tickethub/web

Next.js 15 (App Router, RSC) buyer-facing frontend: catalog, seat selection, checkout,
tickets. Talks only to `apps/gateway` — never to another service, never to the database.
The organizer console is a separate app, `apps/organizer`.

## Running

```bash
pnpm --filter @tickethub/db db:migrate && pnpm db:seed   # once
pnpm --filter @tickethub/gateway dev                     # gateway on :3000
pnpm --filter @tickethub/web dev                         # then open app.localhost:4000
```

**Open `http://app.localhost:4000`, not `localhost:4000`** — a separate hostname from the
console's `admin.localhost:4001` is what gives the two apps separate cookie jars. Safari needs
`127.0.0.1 app.localhost admin.localhost` in `/etc/hosts`; Chrome and Firefox resolve
`*.localhost` themselves.

`GATEWAY_URL` (see `.env.example`) is read server-side only. There is no
`NEXT_PUBLIC_` API URL, by design: the browser talks to this app, this app talks to the
gateway.

## Layout

`app/` holds routes only — a page composes a feature and nothing else. Everything else lives
in `features/<feature>/` (its `api.ts` plus that feature's components, specs co-located) or in
`lib/`, now three config modules: `cookies.ts` (this app's cookie names), `env/` and
`session.ts`. The request/refresh/proxy machinery those used to hold lives in
`@tickethub/web-kit`, shared with `apps/organizer`.

Two rules keep it navigable:

- **Split only when it hurts.** A feature stays flat until it passes ~8 source files or holds
  more than one screen.
- **No barrels inside the app.** Import the file, not an `index.ts` — a barrel would pull
  `server-only` modules into the browser bundle. (The workspace packages do export barrels;
  they are split by runtime instead: `@tickethub/web-kit`, `/server`, `/middleware`.)

Shared test helpers: `test/render.tsx` (`renderWithQuery`). Gateway mocks stay per-feature —
they encode that feature's routing.

## Auth: the BFF

Tokens live in `httpOnly` cookies and never reach client JavaScript. This app's names are
`th_access` / `th_refresh` (`lib/cookies.ts`); `apps/organizer` uses `tho_*`. The plumbing is
`@tickethub/web-kit` — this app only supplies the names.

- `features/auth/actions.ts` — the `login` / `register` Server Action. Calls the gateway and
  writes the cookies, then redirects; the sign-in form works before the page hydrates.
- `app/api/auth/logout` — clears the cookies. Still a route because the sign-out button is a
  shared client component in `@tickethub/ui` with no action of its own to call.
- `app/api/gateway/[...path]` — the proxy every client component goes through. Attaches the
  access token, and on a 401 refreshes once, replays the request, and writes the new cookie
  pair onto the response. It forwards only an allowlist of headers; the browser's cookies
  stop here.
- `middleware.ts` — guards `/orders` and `/tickets`, and renews an expired session before the
  page renders (a Server Component cannot set a cookie). The gateway still verifies every
  token — the middleware only decides what to render.
- `serverApi` from `lib/session.ts` — the same call from a Server Component, reading the
  cookie directly.

## Data

Three paths, picked by what the data is:

1. **RSC + `fetch`** — public reads (catalog, show detail), `revalidate = 60`, SEO metadata.
   Where a client component needs the same data, the RSC seeds the exact TanStack Query cache
   entry and wraps the tree in `HydrationBoundary`, so the browser renders without refetching.
2. **TanStack Query v5** — everything interactive and user-scoped. Query keys are namespaced
   per feature (`catalogKeys.list()`), owned by that feature's `api.ts`.
3. **Socket.IO** (slice 3) — a cache-invalidation channel, never the only source of a fact.

`request` in `@tickethub/web-kit` is the one place a gateway response becomes either data or a typed `ApiError`
(`unauthorized | forbidden | notFound | conflict | expired | validation | unknown`). Responses
are parsed with the same `@tickethub/contracts` Zod schemas the services validate with, so
contract drift fails loudly instead of rendering wrong.

## UI

`design/` is the source of truth — see `design/README.md`. Tokens and primitives live in
**`@tickethub/ui`**, shared with `apps/organizer`: `app/globals.css` here is two `@import`
lines. Components use semantic utilities (`bg-surface`, `text-fg-muted`, `rounded-card`),
never raw hex; repeated visual variants are `cva` definitions.

Those primitives wrap **Radix UI** (`@radix-ui/react-*`) — Radix owns focus, keyboard and
ARIA; we add only the token-driven variants. `Button` supports `asChild`, so a `next/link`
renders as a button without duplicating styles.

## Tree

```
app/
  (public)/  catalog, shows/[id], shows/[id]/seats
  (auth)/    login, register
  (user)/    orders, orders/[id]/checkout, tickets
  api/       BFF route handlers
components/  site-header
features/    one folder per feature: components + api + query keys
lib/         cookie names, env, server session
```

The dashboard/shows/scanner omissions (Recharts, TanStack Table, html5-qrcode) moved with
those screens — see `apps/organizer/README.md`.

## Tests

`pnpm --filter @tickethub/web test` — Vitest + Testing Library, coverage gated at 80/70 over
`features/**` and `middleware.ts` (the shared plumbing gates itself in `@tickethub/web-kit`).
Framework glue (layouts, route handlers) is excluded; the gate covers logic worth breaking a
build over.

## Backend

Several screens need endpoints that do not exist yet. `BACKEND-GAPS.md` is the running list.
