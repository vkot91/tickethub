import { createAuthMiddleware } from '@tickethub/web-kit/middleware';

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/cookies';
import { serverEnv } from '@/lib/env/server';

export const middleware = createAuthMiddleware({
  accessCookie: ACCESS_COOKIE,
  refreshCookie: REFRESH_COOKIE,
  gatewayUrl: () => serverEnv().GATEWAY_URL,
});

/** Guards the (user) route group; everything public is untouched, and the organizer console
 *  is a separate app with its own middleware. */
export const config = {
  matcher: ['/orders/:path*', '/tickets/:path*'],
};
