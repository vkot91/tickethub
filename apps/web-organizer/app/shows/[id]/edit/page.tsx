import { organizerShowPath, showKeys } from '@/features/shows/api';
import { ShowEditor } from '@/features/shows/editor/show-editor';
import { serverApi } from '@/lib/session';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { type Metadata } from 'next';

import { organizerShowSchema } from '@tickethub/contracts';
import { getServerQueryClient } from '@tickethub/web-kit/server';

export const metadata: Metadata = { title: 'Edit show' };

export default async function EditShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);

  const queryClient = getServerQueryClient();

  await queryClient.prefetchQuery({
    queryKey: showKeys.byId(id),
    queryFn: () => serverApi(organizerShowPath(id), {}, organizerShowSchema),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ShowEditor showId={id} tab={tab} />
    </HydrationBoundary>
  );
}
