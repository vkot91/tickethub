# @tickethub/web-organizer

The organizer console: shows, sales dashboard, check-in scanner. Next.js 15 App Router,
port **4001** (`apps/web-user`, the buyer site, is 4000).

```bash
pnpm --filter @tickethub/gateway dev              # gateway on :3000
pnpm --filter @tickethub/web-organizer dev        # then open admin.localhost:4001
```

**Open `http://admin.localhost:4001`, not `localhost:4001`** — a separate hostname from the
buyer site's `app.localhost:4000` is what gives the two apps separate cookie jars. Safari needs
`127.0.0.1 app.localhost admin.localhost` in `/etc/hosts`; Chrome and Firefox resolve
`*.localhost` themselves.

## Shape

| Path            | What                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `app/`          | Routes. `/` dashboard, `/shows`, `/scanner`, `/become`, `/login`.                       |
| `app/api/*`     | The BFF. The browser never calls the gateway directly.                                  |
| `middleware.ts` | Guards everything but `/login`; renews the session; parks a non-organizer on `/become`. |
| `features/`     | Client feature slices — dashboard, shows, scanner, organizer profile.                   |
| `lib/`          | Cookie names, env, the server session built from `@tickethub/web-kit`.                  |

Cookies here are `tho_*`; the buyer site uses `th_*`. Host-only, no `Domain` — the console
cannot inherit a buyer session and vice versa.

Shared with `apps/web-user`: `@tickethub/ui` (presentational components + design tokens) and
`@tickethub/web-kit` (BFF proxy, refresh rotation, query client). Nothing app-specific lives
in either.

## Screens

- **`/become`** — a signed-in buyer creates an organizer profile (`organizer.profile.create`)
  and gains the role. The one place buyer and organizer surfaces legitimately meet.
- **`/shows`** — the organizer's shows with real sold / capacity / revenue, then the editor:
  details, poster upload, price bands, preview and publish.
- **`/`** — sales dashboard, date-range scoped, fanning out over the organizer stats RPCs.
- **`/scanner`** — camera QR scan or a typed short code, one RPC per scan, verified and burned
  server-side.

## Tests

`pnpm --filter @tickethub/web-organizer test` — Vitest + Testing Library, coverage gated at
80/70 over `features/**` and `middleware.ts` (the shared plumbing gates itself in
`@tickethub/web-kit`).
