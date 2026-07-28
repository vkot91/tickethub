'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent } from 'react';
import { type ShowSummary } from '@tickethub/contracts';

import { Button, Card, Field, Input } from '@tickethub/ui';

import { createShow, organizerKeys, updateShow } from '../api';

interface ShowFormProps {
  show?: ShowSummary & { description?: string; venueId?: string };
  onDone?: () => void;
}

/** Create and edit share one form — the only difference is which call it makes. */
export function ShowForm({ show, onDone }: ShowFormProps) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      show ? updateShow(show.id, input) : createShow(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizerKeys.shows() });
      onDone?.();
    },
  });

  const submit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    const formData = new FormData(submitEvent.currentTarget);

    save.mutate({
      title: formData.get('title'),
      description: formData.get('description'),
      venueId: formData.get('venueId'),
      startsAt: new Date(String(formData.get('startsAt'))).toISOString(),
    });
  };

  const error = save.error ? save.error.message : undefined;

  return (
    <Card padding="lg" asChild>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">
          {show ? 'Edit show' : 'Create a show'}
        </h2>

        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={show?.title} required />
        </Field>

        <Field label="Description" htmlFor="description">
          <Input id="description" name="description" defaultValue={show?.description} required />
        </Field>

        <Field label="Venue id" htmlFor="venueId">
          <Input id="venueId" name="venueId" defaultValue={show?.venueId} required />
        </Field>

        <Field label="Starts at" htmlFor="startsAt" error={error}>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={show?.startsAt.slice(0, 16)}
            required
          />
        </Field>

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : show ? 'Save changes' : 'Create show'}
        </Button>
      </form>
    </Card>
  );
}
