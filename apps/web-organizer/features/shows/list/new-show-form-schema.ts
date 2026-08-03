import { z } from 'zod';

import type { CreateShowDto } from '@tickethub/contracts';

/**
 * What the *inputs* produce, transformed into what the API takes. `createShowSchema` wants an ISO
 * timestamp, but `<input type="datetime-local">` yields `2026-08-01T19:30`; and its
 * `venueId: z.string().uuid()` would tell a user who has picked nothing that their venue is an
 * "Invalid uuid". The wire schema stays as it is — this is the widget's side of the boundary.
 */
export const newShowFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the show a title'),
    venueId: z.string().uuid('Pick a hall'),
    startsAt: z.string().min(1, 'Pick a date and time'),
    description: z.string(),
  })
  .transform((form): CreateShowDto => ({
    ...form,
    startsAt: new Date(form.startsAt).toISOString(),
  }));
