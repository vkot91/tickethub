import {
  checkInResultSchema,
  checkInSchema,
  type CheckInDto,
  type CheckInResult,
} from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

// Re-exported so the scanner screens keep importing their shapes from one place. The schemas
// themselves live in contracts — a local copy is how the union quietly lost its fourth result.
export type { CheckInDto, CheckInResult };

/** `showId` is the gate — the show whose door is being scanned, not just any show you own. */
export function checkIn(scan: CheckInDto): Promise<CheckInResult> {
  return clientApi(
    '/organizer/check-in',
    { method: 'POST', body: checkInSchema.parse(scan) },
    checkInResultSchema,
  );
}
