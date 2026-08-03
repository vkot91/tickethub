'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@tickethub/web-kit';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Select,
} from '@tickethub/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';

import { createShow, fetchVenues, showKeys, venueKeys } from './api';

interface NewShowDialogProps {
  trigger: ReactNode;
  onCreated?: (message: string) => void;
}

/** Deliberately small: this creates a *draft*. Everything else about a show is the editor's job. */
export function NewShowDialog({ trigger, onCreated }: NewShowDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  // '' rather than undefined so the Select is controlled from its first render; no venue has an
  // empty id, so Radix still shows the placeholder.
  const [venueId, setVenueId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [description, setDescription] = useState('');

  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: venues } = useQuery({
    queryKey: venueKeys.list(),
    queryFn: fetchVenues,
    enabled: isOpen,
  });

  const create = useMutation({
    mutationFn: createShow,
    onSuccess: (show) => {
      queryClient.invalidateQueries({ queryKey: showKeys.all });
      setIsOpen(false);
      onCreated?.('Draft created');
      router.push(`/shows/${show.id}/edit`);
    },
  });

  const submit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    create.mutate({
      title: title.trim(),
      description,
      venueId,
      startsAt: new Date(startsAt).toISOString(),
    });
  };

  // A duplicate title is a 409, and the fix is in that one field — not in a toast.
  const isDuplicateTitle = create.error instanceof ApiError && create.error.kind === 'conflict';
  const titleError = isDuplicateTitle ? 'You already have a show with this title.' : undefined;

  const otherError = create.error && !isDuplicateTitle ? create.error.message : undefined;

  const canSubmit = Boolean(title.trim() && venueId && startsAt);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) create.reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="mb-4.5">New show</DialogTitle>

        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <Field label="Title" htmlFor="show-title" error={titleError}>
            <Input
              id="show-title"
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              required
            />
          </Field>

          <Field label="Venue" htmlFor="show-venue">
            <Select
              value={venueId}
              onValueChange={setVenueId}
              ariaLabel="Venue"
              placeholder="Pick a hall"
              className="w-full justify-between rounded-control border-line bg-deep px-3.5 py-2.5 text-sm"
              options={(venues ?? []).map((venue) => ({
                value: venue.id,
                label: `${venue.name} — ${venue.city ?? '—'} · ${venue.seatCount} seats`,
              }))}
            />
          </Field>

          <Field label="Starts at" htmlFor="show-starts-at">
            <Input
              id="show-starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(changeEvent) => setStartsAt(changeEvent.target.value)}
              required
            />
          </Field>

          <Field label="Description" htmlFor="show-description" error={otherError}>
            <textarea
              id="show-description"
              value={description}
              onChange={(changeEvent) => setDescription(changeEvent.target.value)}
              rows={3}
              className="w-full rounded-control border border-line bg-deep px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint focus-visible:border-accent focus-visible:outline-none"
            />
          </Field>

          <div className="mt-2 flex justify-end gap-2.5">
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>

            <Button type="submit" size="sm" disabled={!canSubmit || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create draft'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
