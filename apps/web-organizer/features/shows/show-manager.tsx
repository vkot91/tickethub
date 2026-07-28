'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ShowSummary } from '@tickethub/contracts';
import { useState } from 'react';

import {
  Button,
  Card,
  ConfirmDialog,
  formatShowDateTime,
  ShowStatusPill,
  Skeleton,
} from '@tickethub/ui';

import { cancelShow, fetchOrganizerShows, organizerKeys } from '../api';
import { ShowForm } from './show-form';

export function ShowManager() {
  const [editing, setEditing] = useState<ShowSummary | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: organizerKeys.shows(),
    queryFn: fetchOrganizerShows,
  });

  const cancel = useMutation({
    mutationFn: cancelShow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerKeys.shows() }),
  });

  if (isPending) return <Skeleton className="h-75 rounded-panel" />;

  const shows = data?.items ?? [];

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em]">Shows</h1>
        <Button onClick={() => setIsCreating((open) => !open)}>
          {isCreating ? 'Close' : 'New show'}
        </Button>
      </div>

      {isCreating ? (
        <div className="mb-6">
          <ShowForm onDone={() => setIsCreating(false)} />
        </div>
      ) : null}

      {editing ? (
        <div className="mb-6">
          <ShowForm show={editing} onDone={() => setEditing(null)} />
        </div>
      ) : null}

      {shows.length === 0 ? (
        <Card radius="panel" padding="lg" className="text-center">
          <p className="text-sm text-fg-muted">No shows yet.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shows.map((show) => (
            <li key={show.id}>
              <Card padding="lg" asChild>
                <article className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-3">
                      <h2 className="font-display text-base font-semibold">{show.title}</h2>
                      <ShowStatusPill status={show.status} />
                    </div>
                    <p className="font-mono text-xs text-fg-faint">
                      {formatShowDateTime(show.startsAt)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(show)}>
                      Edit
                    </Button>

                    {show.status !== 'cancelled' ? (
                      <ConfirmDialog
                        trigger={
                          <Button variant="secondary" size="sm">
                            Cancel show
                          </Button>
                        }
                        title={`Cancel ${show.title}?`}
                        body="Every paid order is refunded automatically and the show leaves the catalog. This cannot be undone."
                        confirmLabel="Cancel show"
                        isPending={cancel.isPending}
                        onConfirm={() => cancel.mutate(show.id)}
                      />
                    ) : null}
                  </div>
                </article>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {cancel.isError ? (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {cancel.error.message}
        </p>
      ) : null}
    </>
  );
}
