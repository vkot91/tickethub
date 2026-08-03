'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Button, NavTabs, ShowStatusPill, Skeleton } from '@tickethub/ui';

import { fetchOrganizerShow, showKeys } from '../api';
import { DetailsForm } from './details-form';
import { PosterPanel } from './poster-panel';

interface ShowEditorProps {
  showId: string;
  /** From `?tab=`, so a refresh and browser-back both land on the tab that was open. */
  tab?: string;
}

const BANNERS = {
  published: {
    className: 'border-accent/40 bg-accent/12 text-fg-secondary',
    text: 'This show is on sale. Pricing and seating are locked; you can still edit its title, description, poster and sale start.',
  },
  cancelled: {
    className: 'border-danger/40 bg-danger/10 text-danger',
    text: 'This show was cancelled and all paid orders were refunded.',
  },
  finished: {
    className: 'border-danger/40 bg-danger/10 text-danger',
    text: 'This show has finished. Its details can no longer be edited.',
  },
} as const;

export function ShowEditor({ showId, tab }: ShowEditorProps) {
  const { data: show, isPending } = useQuery({
    queryKey: showKeys.byId(showId),
    queryFn: () => fetchOrganizerShow(showId),
  });

  if (isPending) return <Skeleton className="h-150 rounded-panel" />;

  if (!show) {
    return (
      <p role="alert" className="text-sm text-fg-muted">
        This show could not be loaded.
      </p>
    );
  }

  const banner = show.status === 'draft' ? undefined : BANNERS[show.status];
  const isReadOnly = show.status === 'cancelled' || show.status === 'finished';

  const base = `/shows/${show.id}/edit`;

  return (
    <>
      <Link href="/shows" className="mb-4 inline-block text-[13px] text-fg-muted hover:text-fg">
        ← Shows
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">
            {show.title}
          </h1>
          <ShowStatusPill status={show.status} />
        </div>

        {/* ponytail: inert until FE-4 wires the publish checklist — rendered disabled rather than
            omitted, so the header does not shift the day it starts working. */}
        {show.status === 'draft' && (
          <Button disabled title="Publishing lands in the next slice">
            Publish
          </Button>
        )}
      </div>

      {banner && (
        <p className={`mb-4.5 rounded-panel border px-4.5 py-3 text-[13px] ${banner.className}`}>
          {banner.text}
        </p>
      )}

      <div className="mb-6 flex w-fit gap-1 rounded-control border border-line bg-white/5 p-[3px]">
        <NavTabs
          tabs={[
            { href: base, label: 'Details' },
            { href: `${base}?tab=pricing`, label: 'Pricing' },
            { href: `${base}?tab=preview`, label: 'Preview' },
          ]}
        />
      </div>

      {tab === 'pricing' || tab === 'preview' ? (
        <div className="rounded-panel border border-dashed border-white/16 px-6 py-15 text-center text-[13px] text-fg-muted">
          {tab === 'pricing' ? 'Pricing' : 'Preview'} lands in the next slice.
        </div>
      ) : (
        <div className="grid items-start gap-9 lg:grid-cols-[1fr_380px]">
          <DetailsForm show={show} />
          <PosterPanel show={show} readOnly={isReadOnly} />
        </div>
      )}
    </>
  );
}
