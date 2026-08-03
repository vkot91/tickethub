'use client';

import { useRouter } from 'next/navigation';
import { type MouseEvent } from 'react';

import { type OrganizerShow } from '@tickethub/contracts';
import {
  Button,
  buttonVariants,
  formatPrice,
  formatShowDateTime,
  Poster,
  Progress,
  ShowStatusPill,
} from '@tickethub/ui';

const PUBLIC_ORIGIN = 'http://app.localhost:4000';

interface ShowsTableProps {
  shows: OrganizerShow[];
  onCancel: (show: OrganizerShow) => void;
  onDelete: (show: OrganizerShow) => void;
}

const columns = ['Show', 'Venue', 'Date', 'Status', 'Sold', 'Revenue', 'Actions'];

export function ShowsTable({ shows, onCancel, onDelete }: ShowsTableProps) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full min-w-180 border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line font-mono text-[11px] tracking-[0.06em] text-fg-faint uppercase">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-5 py-4 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {shows.map((show) => (
            <ShowRow
              key={show.id}
              show={show}
              onOpen={() => router.push(`/shows/${show.id}/edit`)}
              onCancel={() => onCancel(show)}
              onDelete={() => onDelete(show)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ShowRowProps {
  show: OrganizerShow;
  onOpen: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ShowRow({ show, onOpen, onCancel, onDelete }: ShowRowProps) {
  // A draft has not sold zero tickets — it is not on sale. `apps/shows` returns zeros for these
  // by design, and rendering them literally tells the organizer their show is failing.
  const isOnSale = show.status !== 'draft';

  // The whole row opens the editor, so the actions cell has to swallow its own clicks.
  const stopRowNavigation = (clickEvent: MouseEvent) => clickEvent.stopPropagation();

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-white/5 align-middle last:border-0 hover:bg-white/[0.02]"
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Poster
            seed={show.id}
            src={show.posterUrl}
            className="h-10.5 w-8 shrink-0 rounded-md"
            aria-hidden
          />
          <div className="min-w-0">
            <div className="font-display text-sm text-fg">{show.title}</div>
            <div className="truncate text-[11px] text-fg-faint">
              {show.description.split('\n')[0]}
            </div>
          </div>
        </div>
      </td>

      <td className="px-5 py-4">
        <div className="text-fg-secondary">{show.venueName}</div>
        <div className="text-[11px] text-fg-faint">{show.city}</div>
      </td>

      <td className="px-5 py-4 font-mono text-fg-muted">{formatShowDateTime(show.startsAt)}</td>

      <td className="px-5 py-4">
        <ShowStatusPill status={show.status} />
      </td>

      <td className="px-5 py-4">
        {isOnSale ? (
          <>
            <div className="font-mono">{`${show.soldCount} / ${show.capacity}`}</div>
            <Progress
              value={show.soldCount}
              max={show.capacity}
              label={`Sold for ${show.title}`}
              className="mt-1.5"
            />
          </>
        ) : (
          <span className="text-fg-faint">—</span>
        )}
      </td>

      <td className="px-5 py-4 font-mono">
        {isOnSale ? formatPrice(show.revenueCents) : <span className="text-fg-faint">—</span>}
      </td>

      <td className="px-5 py-4" onClick={stopRowNavigation}>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" onClick={onOpen} variant="secondary" size="xs" className="px-4">
            Edit
          </Button>

          {show.status === 'published' && (
            <>
              <a
                href={`${PUBLIC_ORIGIN}/shows/${show.id}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'primary', size: 'xs' })}
              >
                View public page
              </a>
              <Button type="button" onClick={onCancel} variant="secondary" size="xs">
                Cancel show
              </Button>
            </>
          )}

          {show.status === 'draft' && (
            <Button type="button" onClick={onDelete} variant="danger" size="xs">
              Delete draft
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
