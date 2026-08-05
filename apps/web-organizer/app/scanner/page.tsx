import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { type Metadata } from 'next';

import { getServerQueryClient } from '@tickethub/web-kit/server';

import { Scanner } from '@/features/scanner/scanner';
import { organizerShowsPath, organizerShowsSchema, showKeys } from '@/features/shows/api';
import { serverApi } from '@/lib/session';

export const metadata: Metadata = { title: 'Scanner' };

export default async function ScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ showId?: string }>;
}) {
  const { showId } = await searchParams;

  const queryClient = getServerQueryClient();

  // Seeded rather than fetched client-side, unlike the dashboard's picker: here the gate cannot do
  // anything at all until it has picked a show, so the options are first paint.
  await queryClient.prefetchQuery({
    queryKey: showKeys.list('published'),
    queryFn: () => serverApi(organizerShowsPath('published'), {}, organizerShowsSchema),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Scanner showId={showId} />
    </HydrationBoundary>
  );
}
