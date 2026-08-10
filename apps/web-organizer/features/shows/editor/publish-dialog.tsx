'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { OrganizerShow, PublishChecklist } from '@tickethub/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  formatShowDate,
  Skeleton,
  toast,
} from '@tickethub/ui';
import { ApiError } from '@tickethub/web-kit';

import { fetchPublishChecklist, publishShow, showKeys } from '../api';
import { PUBLIC_ORIGIN } from '../public-origin';

/** The three rules `publishShow` re-checks server-side, in the order the organizer should fix
 *  them. The detail line comes off the counts that ride along with the booleans. */
function lines(checklist: PublishChecklist, show: OrganizerShow) {
  return [
    {
      ok: checklist.hasPriceBands,
      label: 'At least one price band',
      // The design's detail here is a band count, which `publishChecklistSchema` does not carry
      // — it answers the three booleans plus the section and seat counts. Saying "Added" beats
      // inventing a number, and the Pricing tab is one tab away if the organizer wants the list.
      detail: checklist.hasPriceBands ? 'Added' : 'No bands yet',
    },
    {
      ok: checklist.hasPricedSections,
      label: 'At least one section on sale',
      detail: `${checklist.pricedSectionCount} of ${checklist.sectionCount} sections, ${checklist.seatsOnSale} seats`,
    },
    {
      ok: checklist.startsInFuture,
      label: 'Starts in the future',
      detail: checklist.startsInFuture
        ? `Starts ${formatShowDate(show.startsAt)}`
        : `Starts ${formatShowDate(show.startsAt)}, which has passed`,
    },
  ];
}

export function PublishDialog({ show }: { show: OrganizerShow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const checklist = useQuery({
    queryKey: showKeys.checklist(show.id),
    queryFn: () => fetchPublishChecklist(show.id),
    // On open, never on page load: this answer is stale the moment anything else touches the
    // show, and a checklist fetched when the editor mounted would be minutes old by now.
    enabled: open,
    staleTime: 0,
  });

  const publish = useMutation({
    mutationFn: () => publishShow(show.id),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: showKeys.all });
      toast.add('success', {
        title: `${show.title} is on sale`,
        action: { label: 'View public page →', href: `${PUBLIC_ORIGIN}/shows/${show.id}` },
      });
    },
    onError: (error) => {
      // The checklist is never the gate — the server re-evaluates it, and a 409 names the rule
      // that actually failed. It belongs in the dialog, next to the list of rules it is about,
      // not in a toast behind it.
      setConflict(
        error instanceof ApiError ? error.message : 'Something went wrong publishing this show.',
      );
      checklist.refetch();
    },
  });

  const failing = checklist.data ? lines(checklist.data, show).filter((line) => !line.ok) : [];
  const blocked = !checklist.data || failing.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A stale conflict from a previous attempt must not greet the next one.
        if (!next) setConflict(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>Publish</Button>
      </DialogTrigger>

      <DialogContent aria-describedby={undefined} className="w-[min(360px,calc(100vw-3rem))]">
        <DialogTitle className="mb-3.5 text-[15px]">Ready to publish?</DialogTitle>

        {checklist.isPending ? (
          <Skeleton className="h-24 rounded-control" />
        ) : !checklist.data ? (
          <p role="alert" className="text-[13px] text-fg-muted">
            The checklist could not be loaded.
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2.5">
            {lines(checklist.data, show).map((line) => (
              <li key={line.label} className="flex items-start gap-2 text-xs">
                <span
                  aria-hidden
                  className={line.ok ? 'font-bold text-success' : 'font-bold text-danger'}
                >
                  {line.ok ? '✓' : '×'}
                </span>
                <span className="sr-only">{line.ok ? 'Ready:' : 'Not ready:'}</span>
                <span>
                  <span className="block text-fg-secondary">{line.label}</span>
                  <span className="block text-fg-muted">{line.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {conflict && (
          <p
            role="alert"
            className="mb-3 rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {conflict}
          </p>
        )}

        {failing.length > 0 && (
          <p className="mb-2 text-[11px] text-fg-muted">
            {failing.length} {failing.length === 1 ? 'thing' : 'things'} still to fix.
          </p>
        )}

        <Button
          className="w-full"
          disabled={blocked || publish.isPending}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? 'Publishing…' : 'Publish show'}
        </Button>

        <p className="mt-2.5 text-[11px] text-fg-muted">
          Once published, buyers can order seats and pricing is locked.
        </p>
      </DialogContent>
    </Dialog>
  );
}
