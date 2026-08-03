import { z } from 'zod';

/** `becomeOrganizerSchema` in contracts is `min(1)`, which a string of three spaces satisfies.
 *  The console trims before it counts, so the button is not live for a name of nothing. */
export const becomeFormSchema = z.object({
  name: z.string().trim().min(1, 'Give yourself a display name'),
});

export type BecomeForm = z.infer<typeof becomeFormSchema>;
