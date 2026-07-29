import { z } from 'zod';

// Screen A. The name is what buyers see on the organizer's show pages; the role flip itself
// needs nothing but the caller's JWT.
export const becomeOrganizerSchema = z.object({ name: z.string().min(1) });
export type BecomeOrganizerDto = z.infer<typeof becomeOrganizerSchema>;
