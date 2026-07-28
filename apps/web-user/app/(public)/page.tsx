import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { catalogPageSchema } from '@tickethub/contracts';

import { Eyebrow } from '@tickethub/ui';
import { catalogKeys, catalogPath } from '@/features/catalog/api';
import { CatalogGrid } from '@/features/catalog/catalog-grid';
import { FeaturedShow } from '@/features/catalog/featured-show';
import { getServerQueryClient } from '@tickethub/web-kit/server';
import { serverApi } from '@/lib/session';

export const revalidate = 60;

export default async function CatalogPage() {
  const firstPage = await serverApi(catalogPath(), { next: { revalidate } }, catalogPageSchema);

  // Seed the exact cache entry useInfiniteQuery reads, so the browser renders the
  // same page without fetching it a second time.
  const queryClient = getServerQueryClient();

  queryClient.setQueryData(catalogKeys.list(), {
    pages: [firstPage],
    pageParams: [undefined],
  });

  const [featured] = firstPage.items;

  return (
    <div className="mx-auto max-w-295 px-6 pt-9 pb-22.5 [animation:var(--animate-fade)]">
      <Eyebrow className="mb-3 block">Live shows</Eyebrow>

      <h1 className="mb-2 max-w-[16ch] font-display text-[40px] leading-[1.05] font-semibold tracking-[-0.02em]">
        Find your next night out.
      </h1>

      <p className="mb-7 max-w-[52ch] text-[15px] text-fg-muted">
        Concerts, club nights and theatre. Real-time seat selection, instant tickets.
      </p>

      {featured ? <FeaturedShow show={featured} /> : null}

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CatalogGrid />
      </HydrationBoundary>
    </div>
  );
}
