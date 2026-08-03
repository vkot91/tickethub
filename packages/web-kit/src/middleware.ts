import { NextResponse, type NextRequest } from 'next/server';

import type { UserPayload } from '@tickethub/contracts';

import { cookieOptions, type SessionConfig } from './config';
import { decodeAccessToken, isAccessTokenExpired } from './jwt';
import { refreshTokens } from './refresh';

export interface MiddlewareConfig extends SessionConfig {
  /**
   * Called once the session is known to be valid. Return a path to bounce the visitor to when
   * they are signed in but not allowed here — `apps/organizer` sends a plain `user` to `/become`.
   * Returning `undefined` lets the request through.
   */
  authorize?: (user: UserPayload, httpRequest: NextRequest) => string | undefined;
}

/**
 * Guards a Next app's authenticated routes and renews the session in front of them.
 *
 * The renewal is the reason this cannot be a Server Component check: a Server Component cannot
 * set a cookie, so a missing or spent token has to be replaced here or the page renders only to
 * have every one of its gateway calls come back 401.
 */
export function createAuthMiddleware({
  accessCookie,
  refreshCookie,
  gatewayUrl,
  loginPath = '/login',
  authorize,
}: MiddlewareConfig) {
  /** A session that cannot be renewed is over. Clearing the cookies is what makes this a logout
   *  rather than a redirect the user bounces off again on their next click. */
  function logout(httpRequest: NextRequest) {
    const login = new URL(loginPath, httpRequest.url);

    login.searchParams.set('next', httpRequest.nextUrl.pathname);

    const response = NextResponse.redirect(login);

    response.cookies.delete(accessCookie);
    response.cookies.delete(refreshCookie);

    return response;
  }

  return async function middleware(httpRequest: NextRequest) {
    const accessToken = httpRequest.cookies.get(accessCookie)?.value;
    const refreshToken = httpRequest.cookies.get(refreshCookie)?.value;

    let token = accessToken && !isAccessTokenExpired(accessToken) ? accessToken : undefined;
    let renewed;

    if (!token && refreshToken) {
      renewed = await refreshTokens(gatewayUrl(), refreshToken);
      token = renewed?.accessToken;
    }

    const user = token ? decodeAccessToken(token) : null;

    if (!user) return logout(httpRequest);

    const elsewhere = authorize?.(user, httpRequest);

    if (elsewhere) return NextResponse.redirect(new URL(elsewhere, httpRequest.url));

    if (!renewed) return NextResponse.next();

    // The rewritten request header hands the fresh token to this same render pass; the response
    // cookies persist it for the next one.
    httpRequest.cookies.set(accessCookie, renewed.accessToken);

    const response = NextResponse.next({ request: { headers: httpRequest.headers } });

    response.cookies.set(accessCookie, renewed.accessToken, cookieOptions);
    response.cookies.set(refreshCookie, renewed.refreshToken, cookieOptions);

    return response;
  };
}
