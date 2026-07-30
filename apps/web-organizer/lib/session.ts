import 'server-only';

import { createServerSession } from '@tickethub/web-kit/server';

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/cookies';
import { serverEnv } from '@/lib/env/server';

/** The organizer-facing session. Signing in here does not sign anyone in to `apps/web`. */
export const {
  getAccessToken,
  getCurrentUser,
  serverApi,
  setSession,
  signIn,
  logoutRoute,
  gatewayRoute,
} = createServerSession({
  accessCookie: ACCESS_COOKIE,
  refreshCookie: REFRESH_COOKIE,
  gatewayUrl: () => serverEnv().GATEWAY_URL,
});
