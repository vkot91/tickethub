/**
 * What one Next app needs to declare in order to own a session.
 *
 * Everything else in this package is app-agnostic; these four values are the whole difference
 * between `apps/web` and `apps/organizer`.
 */
export interface SessionConfig {
  accessCookie: string;
  refreshCookie: string;
  /** Read lazily, so each app validates its own env on first use rather than at import time. */
  gatewayUrl: () => string;
  /** Where an unauthenticated visitor is sent. Defaults to `/login`. */
  loginPath?: string;
}

/** `?next=` is whatever the visitor put in the URL, so it is only ever allowed to name a path on
 *  this app — `//evil.example` is a protocol-relative URL, not a path. */
export function safeRedirectPath(next: string | undefined): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  // Host-only: no `domain`, so app.tickethub and admin.tickethub never see each other's cookie.
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;
