import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { cache } from 'react';
import type { ZodType } from 'zod';

import {
  authTokensSchema,
  loginSchema,
  registerSchema,
  type AuthTokens,
  type UserPayload,
} from '@tickethub/contracts';

import { cookieOptions, type SessionConfig } from './config';
import { decodeAccessToken } from './jwt';
import { makeQueryClient } from './query';
import { refreshTokens } from './refresh';
import { request, type RequestOptions } from './request';
import { toErrorResponse } from './route-error';

/** One QueryClient per server request, so a Server Component can seed the cache the
 *  browser then hydrates instead of refetching. Session-independent, hence not on the factory. */
export const getServerQueryClient = cache(makeQueryClient);

/** Headers worth carrying through to the gateway. Everything else (cookies above all)
 *  stays on this side of the BFF. */
const FORWARDED_HEADERS = ['content-type', 'idempotency-key', 'x-request-id'];

const credentialSchemas = { login: loginSchema, register: registerSchema } as const;

export type AuthAction = keyof typeof credentialSchemas;

/**
 * Binds this package's cookie-agnostic pieces to one app's cookie names and gateway. Call it
 * once per app and re-export the parts each route needs — the returned closures are the only
 * place a cookie name appears in application code.
 */
export function createServerSession({ accessCookie, refreshCookie, gatewayUrl }: SessionConfig) {
  async function getAccessToken(): Promise<string | undefined> {
    return (await cookies()).get(accessCookie)?.value;
  }

  async function getCurrentUser(): Promise<UserPayload | null> {
    const token = await getAccessToken();

    return token ? decodeAccessToken(token) : null;
  }

  /** Gateway call from a Server Component or route handler. The access token comes
   *  from the httpOnly cookie and never crosses into client JavaScript. */
  async function serverApi<T>(
    path: string,
    options: RequestOptions = {},
    responseSchema?: ZodType<T>,
  ): Promise<T> {
    const token = await getAccessToken();

    return request<T>(`${gatewayUrl()}${path}`, { ...options, token }, responseSchema);
  }

  /**
   * Writes a token pair to this app's session cookies. Any Server Action that gets fresh tokens
   * back from the gateway ends here — signing in, and becoming an organizer, whose response is a
   * re-issued pair carrying the new role.
   */
  async function setSession(tokens: AuthTokens) {
    const jar = await cookies();

    jar.set(accessCookie, tokens.accessToken, cookieOptions);
    jar.set(refreshCookie, tokens.refreshToken, cookieOptions);
  }

  /**
   * Exchanges credentials for this app's session cookies. Call it from a Server Action — the
   * tokens are written straight to the cookie jar, so they never reach client JavaScript, and
   * the sign-in form keeps working with JS disabled. Throws `ApiError` on a rejected login.
   */
  async function signIn(action: AuthAction, credentials: unknown) {
    const tokens = await request(
      `${gatewayUrl()}/auth/${action}`,
      { method: 'POST', body: credentialSchemas[action].parse(credentials) },
      authTokensSchema,
    );

    await setSession(tokens);
  }

  /** `POST /api/auth/logout` — the one auth step that stays a route, because the sign-out
   *  button is a shared client component with no server action of its own to call. */
  async function logoutRoute() {
    const response = NextResponse.json({ ok: true });

    response.cookies.delete(accessCookie);
    response.cookies.delete(refreshCookie);

    return response;
  }

  function forward(target: string, httpRequest: NextRequest, body: string, accessToken?: string) {
    const headers = new Headers();

    for (const name of FORWARDED_HEADERS) {
      const value = httpRequest.headers.get(name);

      if (value) headers.set(name, value);
    }

    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

    return fetch(target, {
      method: httpRequest.method,
      headers,
      body: body || undefined,
      cache: 'no-store',
    });
  }

  async function forwardToGateway(
    httpRequest: NextRequest,
    context: { params: Promise<{ path: string[] }> },
  ) {
    const { path } = await context.params;
    const target = `${gatewayUrl()}/${path.join('/')}${httpRequest.nextUrl.search}`;

    // Buffered once so the 401 retry can replay the same body.
    const body = httpRequest.method === 'GET' ? '' : await httpRequest.text();

    const accessToken = httpRequest.cookies.get(accessCookie)?.value;
    const refreshToken = httpRequest.cookies.get(refreshCookie)?.value;

    let upstream = await forward(target, httpRequest, body, accessToken);
    let refreshed: { accessToken: string; refreshToken: string } | undefined;

    if (upstream.status === 401 && refreshToken) {
      refreshed = await refreshTokens(gatewayUrl(), refreshToken);

      if (refreshed) upstream = await forward(target, httpRequest, body, refreshed.accessToken);
    }

    // Content-Disposition carries the filename the origin chose (the ticket PDF presign sets
    // `ticket-XXXX.pdf`). Drop it and an `<a download>` falls back to the URL's last path
    // segment, which is how every ticket downloaded as `pdf.pdf`.
    const disposition = upstream.headers.get('content-disposition');

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        ...(disposition && { 'content-disposition': disposition }),
      },
    });

    if (refreshed) {
      response.cookies.set(accessCookie, refreshed.accessToken, cookieOptions);
      response.cookies.set(refreshCookie, refreshed.refreshToken, cookieOptions);
    } else if (upstream.status === 401) {
      // Nothing left to renew with. Drop the cookies so the next request stops retrying a dead
      // refresh token, and so the 401 the browser sees is the truth about the session.
      response.cookies.delete(accessCookie);
      response.cookies.delete(refreshCookie);
    }

    return response;
  }

  /** `ALL /api/gateway/[...path]` — the BFF proxy. Re-export it under every verb the app uses. */
  async function gatewayRoute(
    httpRequest: NextRequest,
    context: { params: Promise<{ path: string[] }> },
  ) {
    try {
      return await forwardToGateway(httpRequest, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  return {
    getAccessToken,
    getCurrentUser,
    serverApi,
    setSession,
    signIn,
    logoutRoute,
    gatewayRoute,
  };
}

export type ServerSession = ReturnType<typeof createServerSession>;
