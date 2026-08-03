'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShowSummary, type OrganizerShow } from '@tickethub/contracts';
import { Button, cn, ConfirmDialog, Skeleton, toast } from '@tickethub/ui';
import Link from 'next/link';
import { useState } from 'react';

import { deleteShow, fetchOrganizerShows, showKeys } from './api';
import { NewShowDialog } from './new-show-dialog';
import { ShowsTable } from './shows-table';

type Filter = {
  label: string;
  value: ShowSummary['status'] | undefined;
};

const filters: readonly Filter[] = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Finished', value: 'finished' },
] as const;

interface ShowsScreenProps {
  /** From the URL, not local state — the route filters server-side, so the query key follows it. */
  status?: string;
}

export function ShowsScreen({ status }: ShowsScreenProps) {
  // Which show a confirm is open for, and which of the two destructive verbs it is.
  const [pendingCancel, setPendingCancel] = useState<OrganizerShow>();
  const [pendingDelete, setPendingDelete] = useState<OrganizerShow>();

  const queryClient = useQueryClient();

  const { data: shows, isPending } = useQuery({
    queryKey: showKeys.list(status),
    queryFn: () => fetchOrganizerShows(status),
  });

  const remove = useMutation({
    mutationFn: deleteShow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: showKeys.all });
      setPendingCancel(undefined);
      setPendingDelete(undefined);
      toast.add('success', { title: 'Show removed' });
    },
  });

  return (
    <>
      <div className="mb-5.5 flex flex-wrap items-center justify-between gap-3.5">
        <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em]">Shows</h1>
        <NewShowDialog trigger={<Button>New show</Button>} />
      </div>

      <div className="mb-5 flex w-fit gap-0.5 rounded-control border border-line bg-white/5 p-[3px]">
        {filters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.value ? `/shows?status=${filter.value}` : '/shows'}
            aria-current={status === filter.value ? 'page' : undefined}
            className={cn(
              'rounded-[9px] px-3.5 py-1.5 text-[13px] text-fg-muted hover:text-fg',
              status === filter.value && 'bg-accent text-white',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-75 rounded-panel" />
      ) : shows && shows.length > 0 ? (
        <ShowsTable shows={shows} onCancel={setPendingCancel} onDelete={setPendingDelete} />
      ) : (
        <div className="rounded-panel border border-dashed border-white/16 px-6 py-15 text-center">
          <h3 className="mb-2 font-display text-lg">No shows yet</h3>
          <p className="mb-5 text-sm text-fg-muted">
            Create a show, price its sections, then publish it to put it on sale.
          </p>
          <NewShowDialog trigger={<Button>New show</Button>} />
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDelete(undefined)}
          title={`Delete ${pendingDelete.title}?`}
          body="This removes the draft and its pricing. This can't be undone."
          confirmLabel="Delete draft"
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(pendingDelete.id)}
        />
      )}

      {pendingCancel && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingCancel(undefined)}
          title={`Cancel ${pendingCancel.title}?`}
          body="Every paid order for this show will be refunded automatically. This can't be undone."
          note="Refunds are processed by Stripe and can take a few minutes to appear."
          confirmLabel="Cancel show & refund"
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(pendingCancel.id)}
        />
      )}

      {remove.isError && (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {remove.error.message}
        </p>
      )}
    </>
  );
}
