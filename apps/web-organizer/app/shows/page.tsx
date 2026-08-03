import { WelcomeToast } from '@/features/organizer/welcome-toast';
import { organizerShowsPath, organizerShowsSchema, showKeys } from '@/features/shows/api';
import { ShowsScreen } from '@/features/shows/list/shows-screen';
import { serverApi } from '@/lib/session';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { type Metadata } from 'next';

import { getServerQueryClient } from '@tickethub/web-kit/server';

export const metadata: Metadata = { title: 'Shows' };

export default async function ShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; status?: string }>;
}) {
  const { welcome, status } = await searchParams;

  const queryClient = getServerQueryClient();

  // Seeds the exact key `ShowsScreen` reads, so the table is in the first HTML response and the
  // browser does not fetch the same list again. `middleware.ts` has already refreshed the access
  // token and written it onto this request, so the cookie `serverApi` reads is a live one.
  //
  // `prefetchQuery` rather than `fetchQuery` on purpose: it swallows a failure instead of throwing,
  // so a gateway hiccup leaves the cache empty and the client falls back to fetching through the
  // BFF — which is the path that can refresh and redirect properly. Slower, never a 500.
  await queryClient.prefetchQuery({
    queryKey: showKeys.list(status),
    queryFn: () => serverApi(organizerShowsPath(status), {}, organizerShowsSchema),
  });

  return (
    <>
      {welcome === '1' && <WelcomeToast />}

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ShowsScreen status={status} />
      </HydrationBoundary>
    </>
  );
}
