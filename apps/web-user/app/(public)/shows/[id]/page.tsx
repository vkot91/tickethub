import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { showDetailSchema, type ShowDetail } from '@tickethub/contracts';
import {
  Button,
  Eyebrow,
  formatPrice,
  formatShowDateTime,
  Poster,
  ShowStatusPill,
  TIER_DOT,
} from '@tickethub/ui';
import { ApiError } from '@tickethub/web-kit';

import { serverApi } from '@/lib/session';

export const revalidate = 60;

async function getShow(id: string): Promise<ShowDetail> {
  try {
    return await serverApi(`/shows/${id}`, { next: { revalidate } }, showDetailSchema);
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'notFound') notFound();

    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const show = await getShow(id);

  return { title: show.title, description: show.description };
}

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await getShow(id);

  return (
    <div className="mx-auto max-w-295 [animation:var(--animate-fade)] px-6 pt-7 pb-22.5">
      <Link href="/" className="mb-5 inline-block text-[13px] text-fg-muted hover:text-fg">
        ← Back to catalog
      </Link>

      <div className="grid items-start gap-9 md:grid-cols-[minmax(280px,420px)_1fr]">
        <Poster
          seed={show.id}
          src={show.posterUrl}
          className="aspect-3/4 rounded-[18px] border border-line"
        >
          {show.posterUrl ? null : (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-lg border border-dashed border-white/20 px-3 py-2 font-mono text-[11px] tracking-[0.1em] text-white/30">
                POSTER 3:4
              </span>
            </span>
          )}
        </Poster>

        <div>
          <Eyebrow className="mb-3 block">Show</Eyebrow>

          <h1 className="mb-1.5 font-display text-[38px] leading-[1.02] font-semibold tracking-[-0.02em]">
            {show.title}
          </h1>

          <div className="mb-6">
            <ShowStatusPill status={show.status} />
          </div>

          <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.07]">
            <div className="bg-surface px-4.5 py-4">
              <dt className="mb-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-faint">DATE</dt>
              <dd className="text-[15px]">{formatShowDateTime(show.startsAt)}</dd>
            </div>
            <div className="bg-surface px-4.5 py-4">
              <dt className="mb-1.5 font-mono text-[10px] tracking-[0.1em] text-fg-faint">VENUE</dt>
              <dd className="font-mono text-[13px] text-fg-secondary">{show.venueId}</dd>
            </div>
          </dl>

          <p className="mb-7 max-w-[56ch] text-[15px] leading-relaxed text-fg-secondary">
            {show.description}
          </p>

          {show.priceTiers.length > 0 && (
            <ul aria-label="Prices" className="mb-7 flex flex-col gap-2.5">
              {show.priceTiers.map((priceTier) => (
                <li
                  key={priceTier.id}
                  className="flex items-center justify-between gap-4 rounded-control border border-line bg-surface px-4.5 py-3.5"
                >
                  <span className="flex items-center gap-2.5 text-[15px]">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${TIER_DOT[priceTier.tier]}`}
                    />
                    {priceTier.name}
                  </span>

                  <span className="font-display text-[15px] font-semibold">
                    {formatPrice(priceTier.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {show.status === 'published' ? (
            <Button asChild size="lg">
              <Link href={`/shows/${show.id}/seats`}>Choose seats →</Link>
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">Seats are not on sale for this show.</p>
          )}
        </div>
      </div>
    </div>
  );
}
