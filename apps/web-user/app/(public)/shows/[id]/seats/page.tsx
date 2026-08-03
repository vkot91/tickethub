import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { showDetailSchema } from '@tickethub/contracts';
import { formatShowDateTime } from '@tickethub/ui';
import { ApiError } from '@tickethub/web-kit';

import { SeatMap } from '@/features/seat-map/seat-map';
import { serverApi } from '@/lib/session';

export const metadata: Metadata = { title: 'Choose your seats' };

export default async function SeatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const show = await serverApi(`/shows/${id}`, { cache: 'no-store' }, showDetailSchema).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.kind === 'notFound') notFound();

      throw error;
    },
  );

  return (
    <div className="mx-auto max-w-295 [animation:var(--animate-fade)] px-6 pt-7 pb-35">
      <Link
        href={`/shows/${show.id}`}
        className="mb-4 inline-block text-[13px] text-fg-muted hover:text-fg"
      >
        ← {show.title}
      </Link>

      <h1 className="mb-1 font-display text-[28px] font-semibold tracking-[-0.02em]">
        Choose your seats
      </h1>
      <p className="mb-6 text-sm text-fg-muted">{formatShowDateTime(show.startsAt)}</p>

      <SeatMap showId={show.id} />
    </div>
  );
}
