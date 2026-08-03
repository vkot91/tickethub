'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import type { OrganizerShow } from '@tickethub/contracts';
import {
  Button,
  Card,
  ConfirmDialog,
  Form,
  FormError,
  FormField,
  FormSelect,
  toast,
} from '@tickethub/ui';

import { fetchVenues, showKeys, updateShow, venueKeys } from '../api';
import {
  detailsFormSchema,
  toFormValues,
  type DetailsFormInput,
  type DetailsFormOutput,
} from './details-form-schema';

interface DetailsFormProps {
  show: OrganizerShow;
}

export function DetailsForm({ show }: DetailsFormProps) {
  const isDraft = show.status === 'draft';
  const isReadOnly = show.status === 'cancelled' || show.status === 'finished';

  // Held rather than saved while the "this clears your pricing" confirm is open.
  const [pendingVenueChange, setPendingVenueChange] = useState<Partial<DetailsFormOutput>>();

  const queryClient = useQueryClient();

  const form = useForm<DetailsFormInput, unknown, DetailsFormOutput>({
    resolver: zodResolver(detailsFormSchema),
    mode: 'onTouched',
    defaultValues: toFormValues(show),

    ...(isReadOnly && { disabled: true }),
  });

  const { dirtyFields, isDirty } = form.formState;

  const { data: venues } = useQuery({ queryKey: venueKeys.list(), queryFn: fetchVenues });

  const save = useMutation({
    mutationFn: (patch: Partial<DetailsFormOutput>) => updateShow(show.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: showKeys.all });

      form.reset(form.getValues());
      setPendingVenueChange(undefined);
      toast.add('success', { title: 'Show saved' });
    },
    onError: (failure) => form.setError('root', { message: failure.message }),
  });

  /**
   * **Only what changed.** `apps/shows` rejects a *present* key that this status may not touch,
   * whether or not its value differs — so sending the whole object 409s on a published show over
   * a `venueId` the organizer never touched. RHF already tracks the diff against `defaultValues`
   * and un-dirties a field reverted by hand, which is exactly the set to send.
   */
  function onSubmit(values: DetailsFormOutput) {
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((field) => [field, values[field as keyof DetailsFormOutput]]),
    );

    if (dirtyFields.venueId && isDraft) return setPendingVenueChange(patch);

    save.mutate(patch);
  }

  return (
    <>
      <Card className="flex flex-col gap-5 p-6">
        <Form form={form} onSubmit={onSubmit} className="flex flex-col gap-5">
          <FormField name="title" label="Title" />

          <FormField
            name="description"
            label="Description"
            as="textarea"
            rows={6}
            hint="Shown on the public show page."
          />

          {/* Locked off-draft for the same reason the venue is: a start time is printed on
              tickets people already hold. */}
          <FormField
            name="startsAt"
            label="Starts at"
            type="datetime-local"
            disabled={!isDraft && !isReadOnly}
          />

          {/* Both lines are the field's own hint rather than a paragraph after it: `Field`
              renders the error last, so anything appended outside lands *under* the error. */}
          <FormField
            name="saleStartsAt"
            label="Sale starts at"
            type="datetime-local"
            hint="Leave empty to sell as soon as the show is published."
          />

          <FormSelect
            name="venueId"
            label="Venue"
            placeholder="Pick a hall"
            disabled={!isDraft}
            hint={isDraft ? "Changing the venue clears the pricing you've set." : undefined}
            options={(venues ?? []).map((venue) => ({
              value: venue.id,
              label: `${venue.name} — ${venue.city ?? '—'} · ${venue.seatCount} seats`,
            }))}
          />

          <FormError />

          {!isReadOnly && (
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!isDirty || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </Form>
      </Card>

      {pendingVenueChange && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingVenueChange(undefined)}
          title="Change venue?"
          body="Changing the venue clears this show's pricing."
          confirmLabel="Change venue"
          isPending={save.isPending}
          onConfirm={() => save.mutate(pendingVenueChange)}
        />
      )}
    </>
  );
}
