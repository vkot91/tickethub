import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './request';

/** Neutral (no `'use client'`) so both the server helper (`lib/query.ts`) and the client
 *  provider (`components/query-provider.tsx`) can import the same factory — a client-only
 *  module cannot be called from a Server Component. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnReconnect: 'always',
        // A 401 or a 409 will not become truer on a second try.
        retry: (failureCount, error) => (error instanceof ApiError ? false : failureCount < 2),
      },
    },
  });
}
