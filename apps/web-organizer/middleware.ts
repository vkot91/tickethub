import { createAuthMiddleware } from '@tickethub/web-kit/middleware';

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/cookies';
import { serverEnv } from '@/lib/env/server';

export const middleware = createAuthMiddleware({
  accessCookie: ACCESS_COOKIE,
  refreshCookie: REFRESH_COOKIE,
  gatewayUrl: () => serverEnv().GATEWAY_URL,
  authorize: (user, httpRequest) => {
    if (user.role !== 'user') return undefined;

    // A buyer who signs in here is not an organizer yet. `/become` explains how to become one,
    // and must let itself through or the redirect loops.
    return httpRequest.nextUrl.pathname === '/become' ? undefined : '/become';
  },
});

/** The whole console is private. Only the sign-in and signup pages, the BFF routes (which do
 *  their own auth) and Next's static assets are exempt. */
export const config = {
  matcher: ['/((?!login|register|api|_next/static|_next/image|favicon.ico).*)'],
};
