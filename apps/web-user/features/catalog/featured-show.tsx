import Link from 'next/link';

import { type ShowSummary } from '@tickethub/contracts';
import { Button, formatShowDateTime, Poster, StatusPill } from '@tickethub/ui';

export function FeaturedShow({ show }: { show: ShowSummary }) {
  return (
    <Poster
      seed={show.id}
      src={show.posterUrl}
      className="mb-9 min-h-70 rounded-panel border border-line"
    >
      <span className="absolute inset-0 bg-linear-to-r from-page/[0.92] via-page/[0.62] to-page/[0.15]" />

      <div className="relative flex min-h-70 max-w-140 flex-col justify-end p-9">
        <StatusPill tone="neutral" className="mb-3.5 self-start uppercase">
          Featured
        </StatusPill>

        <h2 className="mb-1.5 font-display text-[34px] leading-none font-semibold tracking-[-0.02em]">
          {show.title}
        </h2>

        <p className="mb-5 font-mono text-[13px] text-fg-muted">
          {formatShowDateTime(show.startsAt)}
        </p>

        <div>
          <Button asChild>
            <Link href={`/shows/${show.id}/seats`}>Choose seats →</Link>
          </Button>
        </div>
      </div>
    </Poster>
  );
}
