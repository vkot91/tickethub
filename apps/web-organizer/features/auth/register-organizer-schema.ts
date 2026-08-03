import { z } from 'zod';

import { registerSchema } from '@tickethub/contracts';

/** Signup and the role flip are one screen here, so the form carries the display name that
 *  `become-organizer` needs alongside the credentials `register` needs. Trimmed for the same
 *  reason `become-form-schema` trims: a name of three spaces is not a name. */
export const registerOrganizerFormSchema = registerSchema.extend({
  name: z.string().trim().min(1, 'Give yourself a display name'),
});

export type RegisterOrganizerForm = z.infer<typeof registerOrganizerFormSchema>;
