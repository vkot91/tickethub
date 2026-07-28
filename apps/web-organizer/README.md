# @tickethub/organizer

The organizer console: shows, sales dashboard, check-in scanner. Next.js 15 App Router,
port **4001** (`apps/web`, the buyer site, is 4000).

```bash
pnpm --filter @tickethub/organizer dev   # then open admin.localhost:4001
```

**Open `http://admin.localhost:4001`, not `localhost:4001`** — see below.

## Shape

| Path            | What                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `app/`          | Routes. `/` dashboard, `/shows`, `/scanner`, `/become`, `/login`.                       |
| `app/api/*`     | The BFF. The browser never calls the gateway directly.                                  |
| `middleware.ts` | Guards everything but `/login`; renews the session; parks a non-organizer on `/become`. |
| `features/`     | Client feature slices — dashboard, shows, scanner.                                      |
| `lib/`          | Cookie names, env, the server session built from `@tickethub/web-kit`.                  |

Shared with `apps/web`: `@tickethub/ui` (presentational components + design tokens) and
`@tickethub/web-kit` (BFF proxy, refresh rotation, query client). Nothing app-specific lives
in either.

## Not built yet

`/become` is explanatory copy only, and the dashboard/shows/scanner call organizer endpoints
that do not exist on the gateway yet — see `apps/web/BACKEND-GAPS.md` and
`docs/10-organizer-console.md`.
