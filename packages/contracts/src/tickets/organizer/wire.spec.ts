import { TICKETS_MESSAGE_PATTERNS } from '../user/wire';
import { ORGANIZER_TICKETS_MESSAGE_PATTERNS } from './wire';

describe('organizer tickets wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT).toBe(
      'organizer.tickets.checkedInCount',
    );
  });

  // `checkedInCount` used to live in the buyer map — a console-only call a buyer route could have
  // reached for. It now has to cross a folder to be found.
  it('is not reachable from the buyer map', () => {
    expect(Object.values<string>({ ...TICKETS_MESSAGE_PATTERNS })).not.toContain(
      ORGANIZER_TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT,
    );
  });
});
