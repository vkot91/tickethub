# @tickethub/web-kit

The BFF and session plumbing shared by `apps/web` and `apps/organizer`: the typed `request`
wrapper, `ApiError`, the gateway proxy, JWT reading, refresh-token de-duplication and the auth
middleware.

Ships TypeScript source (like `@tickethub/ui`); consumers list it in `transpilePackages`.

## Three entry points, because there are three runtimes

| Import                          | Safe from                         | Holds                                                                                                          |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@tickethub/web-kit`            | anywhere                          | `request`, `ApiError`, `clientApi`, `toErrorResponse`, `decodeAccessToken`, `refreshTokens`, `makeQueryClient` |
| `@tickethub/web-kit/server`     | Server Components, route handlers | `createServerSession` → `getCurrentUser`, `serverApi`, `authRoute`, `gatewayRoute`                             |
| `@tickethub/web-kit/middleware` | edge middleware                   | `createAuthMiddleware`                                                                                         |

`/server` pulls in `next/headers`, which the edge middleware cannot use — keeping them apart is
the whole reason for the split.

## Cookie names are per app, on purpose

Nothing here hardcodes a cookie name. Each app declares its own pair, so a buyer's session and
an organizer's can never overwrite each other:

```ts
export const session = createServerSession({
  accessCookie: 'tho_access',
  refreshCookie: 'tho_refresh',
  gatewayUrl: () => serverEnv().GATEWAY_URL,
});
```

Cookies are host-only (no `domain`), so the isolation follows the hostname: `app.` and `admin.`
subdomains in production, `app.localhost:4000` and `admin.localhost:4001` in development.
