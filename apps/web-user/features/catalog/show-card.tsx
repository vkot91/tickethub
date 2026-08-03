import Link from 'next/link';

import { type ShowSummary } from '@tickethub/contracts';
import { Card, formatShowDate, Poster, ShowStatusPill } from '@tickethub/ui';

export function ShowCard({ show }: { show: ShowSummary }) {
  return (
    <Link href={`/shows/${show.id}`} className="block">
      <Card padding="none" interactive className="h-full overflow-hidden">
        <Poster seed={show.id} src={show.posterUrl} className="h-42.5">
          <span className="absolute inset-0 bg-linear-to-b from-transparent from-40% to-page/70" />
          <span
            aria-hidden
            className="absolute bottom-3 left-3 font-display text-[44px] leading-none font-bold opacity-[0.14]"
          >
            {show.title}
          </span>
        </Poster>

        <div className="px-4 pt-4 pb-4.25">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-semibold tracking-[-0.01em]">
              {show.title}
            </h3>
            <ShowStatusPill status={show.status} />
          </div>

          <p className="font-mono text-xs text-fg-faint">{formatShowDate(show.startsAt)}</p>
        </div>
      </Card>
    </Link>
  );
}
