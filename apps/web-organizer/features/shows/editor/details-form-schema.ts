import { z } from 'zod';

import type { OrganizerShow, UpdateShowDto } from '@tickethub/contracts';

/**
 * The editor's side of the widget boundary, for the same reasons as `newShowFormSchema`:
 * `<input type="datetime-local">` yields `2026-08-01T19:30`, not an ISO timestamp, and an empty
 * sale start is `''` on the wire between the DOM and here, not `null`.
 */
export const detailsFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the show a title'),
    description: z.string(),
    startsAt: z.string().min(1, 'Pick a date and time'),
    saleStartsAt: z.string(),
    venueId: z.string().uuid('Pick a hall'),
  })
  // Selling after the doors open is not a schedule, it is a typo. Compared as instants rather
  // than strings because a browser may or may not include seconds in a `datetime-local` value.
  // Equal is allowed: sales opening exactly at curtain is odd, but it is not wrong.
  .superRefine((form, ctx) => {
    if (!form.saleStartsAt || !form.startsAt) return;

    if (new Date(form.saleStartsAt) > new Date(form.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['saleStartsAt'],
        message: 'Sales cannot start after the show does.',
      });
    }
  })
  .transform(
    (
      form,
    ): Required<Pick<UpdateShowDto, 'title' | 'description' | 'startsAt' | 'venueId'>> &
      Pick<UpdateShowDto, 'saleStartsAt'> => ({
      title: form.title,
      description: form.description,
      venueId: form.venueId,
      startsAt: new Date(form.startsAt).toISOString(),
      // Clearing the field is an edit — `null` blanks the column, `undefined` would mean
      // "leave it alone", and the two are different requests.
      saleStartsAt: form.saleStartsAt === '' ? null : new Date(form.saleStartsAt).toISOString(),
    }),
  );

export type DetailsFormInput = z.input<typeof detailsFormSchema>;
export type DetailsFormOutput = z.output<typeof detailsFormSchema>;

/** An ISO instant as `<input type="datetime-local">` wants it: the *local* wall clock, no zone,
 *  to the minute. `toISOString()` alone would show the organizer a UTC time and then save it back
 *  shifted by their offset. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';

  const instant = new Date(iso);

  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function toFormValues(show: OrganizerShow): DetailsFormInput {
  return {
    title: show.title,
    description: show.description,
    startsAt: toLocalInput(show.startsAt),
    saleStartsAt: toLocalInput(show.saleStartsAt),
    venueId: show.venueId,
  };
}
