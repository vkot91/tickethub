import type { ZodType } from 'zod';

import { ApiError, request, type RequestOptions } from './request';

/** Gateway call from a client component. Goes through the BFF proxy so the browser
 *  sends only its httpOnly cookie — never a bearer token it can read. */
export async function clientApi<T>(
  path: string,
  options: RequestOptions = {},
  responseSchema?: ZodType<T>,
): Promise<T> {
  try {
    return await request<T>(
      `/api/gateway${path}`,
      { ...options, credentials: 'same-origin' },
      responseSchema,
    );
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'unauthorized') redirectToLogin();

    throw error;
  }
}

/** By the time a 401 reaches the browser the proxy has already tried to refresh and cleared
 *  the cookies, so there is nothing to retry — only somewhere to go. A full navigation rather
 *  than a router push, because it has to drop the query cache and re-run the middleware. */
function redirectToLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;

  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}
