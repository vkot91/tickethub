'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateShowDto } from '@tickethub/contracts';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Form,
  FormError,
  FormField,
  FormSelect,
  toast,
} from '@tickethub/ui';
import { ApiError } from '@tickethub/web-kit';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { createShow, fetchVenues, showKeys, venueKeys } from './api';
import { newShowFormSchema } from './new-show-form-schema';

interface NewShowDialogProps {
  trigger: ReactNode;
}

/** Deliberately small: this creates a *draft*. Everything else about a show is the editor's job. */
export function NewShowDialog({ trigger }: NewShowDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient();

  // Three generics because the schema transforms: the inputs hold a `datetime-local` string,
  // `onSubmit` receives a `CreateShowDto`.
  const form = useForm<z.input<typeof newShowFormSchema>, unknown, CreateShowDto>({
    resolver: zodResolver(newShowFormSchema),
    mode: 'onTouched',
    defaultValues: { title: '', venueId: '', startsAt: '', description: '' },
  });

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
      toast.add('success', { title: 'Draft created' });
      router.push(`/shows/${show.id}/edit`);
    },
    // A duplicate title is a 409, and the fix is in that one field — not in a toast.
    onError: (failure) =>
      failure instanceof ApiError && failure.kind === 'conflict'
        ? form.setError('title', { message: 'You already have a show with this title.' })
        : form.setError('root', { message: failure.message }),
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) form.reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="mb-4.5">New show</DialogTitle>

        <Form
          form={form}
          onSubmit={(formValues) => create.mutate(formValues)}
          className="flex flex-col gap-3.5"
        >
          <FormField name="title" label="Title" />

          <FormSelect
            name="venueId"
            label="Venue"
            placeholder="Pick a hall"
            options={(venues ?? []).map((venue) => ({
              value: venue.id,
              label: `${venue.name} — ${venue.city ?? '—'} · ${venue.seatCount} seats`,
            }))}
          />

          <FormField name="startsAt" label="Starts at" type="datetime-local" />
          <FormField name="description" label="Description" as="textarea" rows={3} />

          <FormError />

          <div className="mt-2 flex justify-end gap-2.5">
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>

            <Button
              type="submit"
              size="sm"
              disabled={form.formState.isSubmitting || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create draft'}
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
