import { userPayloadSchema, type UserPayload } from '@tickethub/contracts';

/** A token this close to expiry is treated as already expired, so a request does not land
 *  after the gateway has stopped accepting it. */
const EXPIRY_SKEW_SECONDS = 30;

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');

  // atob keeps this usable from the edge middleware runtime, where Buffer is absent.
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

function readClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];

  if (!payload) return null;

  try {
    const claims: unknown = JSON.parse(base64UrlDecode(payload));

    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Reads the JWT claims for UI and routing purposes only — the gateway verifies the
 *  signature on every call, so a forged cookie buys nothing but a wrong-looking navbar. */
export function decodeAccessToken(token: string): UserPayload | null {
  const claims = readClaims(token);

  if (!claims) return null;

  const parsed = userPayloadSchema.safeParse(claims);

  return parsed.success ? parsed.data : null;
}

/** Fails closed: a token with no readable `exp` counts as expired, because the alternative
 *  is rendering a page whose data calls are all about to 401. */
export function isAccessTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const exp = readClaims(token)?.exp;

  if (typeof exp !== 'number') return true;

  return exp - EXPIRY_SKEW_SECONDS <= nowMs / 1000;
}
