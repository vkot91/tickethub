import { authTokensSchema, type AuthTokens } from '@tickethub/contracts';

import { request } from './request';

/** The auth service rotates the refresh token and stores a single value per user, so two
 *  refreshes racing on the same token revoke each other and end the session. Callers that
 *  arrive while one is in flight join it instead of starting their own. */
const inFlight = new Map<string, Promise<AuthTokens | undefined>>();

/** Resolves to the new token pair, or to `undefined` when the session cannot be renewed —
 *  a dead refresh token is a logout, not an exception to handle at every call site. */
export function refreshTokens(
  gatewayUrl: string,
  refreshToken: string,
): Promise<AuthTokens | undefined> {
  const pending = inFlight.get(refreshToken);

  if (pending) return pending;

  const attempt = request(
    `${gatewayUrl}/auth/refresh`,
    { method: 'POST', body: { refreshToken } },
    authTokensSchema,
  )
    .catch(() => undefined)
    .finally(() => inFlight.delete(refreshToken));

  inFlight.set(refreshToken, attempt);

  return attempt;
}
