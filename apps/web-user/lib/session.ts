import 'server-only';

import { createServerSession } from '@tickethub/web-kit/server';

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/cookies';
import { serverEnv } from '@/lib/env/server';

/** The buyer-facing session. `apps/organizer` declares its own, with its own cookie names. */
export const { getAccessToken, getCurrentUser, serverApi, signIn, logoutRoute, gatewayRoute } =
  createServerSession({
    accessCookie: ACCESS_COOKIE,
    refreshCookie: REFRESH_COOKIE,
    gatewayUrl: () => serverEnv().GATEWAY_URL,
  });
