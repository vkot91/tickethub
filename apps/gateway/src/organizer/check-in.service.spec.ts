import { NotFoundException } from '@nestjs/common';

import { OrganizerCheckInService } from './check-in.service';

const SHOW_ID = '11111111-1111-4111-8111-111111111111';
const RIVAL_SHOW = '22222222-2222-4222-8222-222222222222';

const dto = { code: 'tok', showId: SHOW_ID };

const scan = {
  result: 'valid' as const,
  seatLabel: 'Parterre A2',
  checkedInAt: '2026-07-30T18:00:00.000Z',
  checkedInCount: 41,
};

describe('OrganizerCheckInService', () => {
  const amqp = { request: jest.fn() };
  const myShows = { assertOwnsShow: jest.fn() };
  const service = new OrganizerCheckInService(amqp as never, myShows as never);

  /** One entry per routing key the merge may reach for, so call order never matters. */
  const answer = (byKey: Record<string, unknown>) =>
    amqp.request.mockImplementation(({ routingKey }: { routingKey: string }) =>
      routingKey in byKey ? byKey[routingKey] : Promise.reject(new Error(`no stub: ${routingKey}`)),
    );

  const allUp = () =>
    answer({
      'organizer.tickets.checkIn': scan,
      'shows.detail': { title: 'Radiohead Live' },
      'organizer.shows.capacity': [{ showId: SHOW_ID, capacity: 120 }],
    });

  beforeEach(() => {
    amqp.request.mockReset();
    myShows.assertOwnsShow.mockReset().mockResolvedValue([SHOW_ID]);
  });

  it('merges the gate’s title and capacity into the verdict', async () => {
    allUp();

    await expect(service.checkIn('u1', dto)).resolves.toEqual({
      result: 'valid',
      seatLabel: 'Parterre A2',
      showTitle: 'Radiohead Live',
      checkedInAt: '2026-07-30T18:00:00.000Z',
      checkedInCount: 41,
      capacity: 120,
    });
  });

  it('hands Fulfillment the one gate, never the user and never a list', async () => {
    allUp();

    await service.checkIn('u1', dto);

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.tickets.checkIn',
        payload: { code: 'tok', showId: SHOW_ID },
      }),
    );
  });

  // 404 and not 403, so an organizer cannot probe for a competitor's show by id. An organizer who
  // owns nothing owns no gate either, and lands here too.
  it('refuses a gate the caller does not own, before scanning anything', async () => {
    myShows.assertOwnsShow.mockRejectedValue(new NotFoundException('Show not found'));

    await expect(service.checkIn('u1', { code: 'tok', showId: RIVAL_SHOW })).rejects.toThrow(
      NotFoundException,
    );

    expect(amqp.request).not.toHaveBeenCalled();
  });

  it('proves ownership of the show being scanned, not merely of something', async () => {
    allUp();

    await service.checkIn('u1', dto);

    expect(myShows.assertOwnsShow).toHaveBeenCalledWith('u1', SHOW_ID);
  });

  // The gate is already open by the time we get here; a broken Shows must not swallow the verdict.
  it('still reports the verdict when the show lookup fails', async () => {
    answer({ 'organizer.tickets.checkIn': scan });

    await expect(service.checkIn('u1', dto)).resolves.toEqual(
      expect.objectContaining({ result: 'valid', showTitle: null, capacity: 0 }),
    );
  });

  // Both numbers describe the gate, so a rejection carries them exactly like an admission.
  it('reports the gate’s capacity even when the ticket is for another show', async () => {
    answer({
      'organizer.tickets.checkIn': {
        result: 'wrongShow',
        seatLabel: null,
        checkedInAt: null,
        checkedInCount: 41,
      },
      'shows.detail': { title: 'Radiohead Live' },
      'organizer.shows.capacity': [{ showId: SHOW_ID, capacity: 120 }],
    });

    await expect(service.checkIn('u1', dto)).resolves.toEqual({
      result: 'wrongShow',
      seatLabel: null,
      showTitle: 'Radiohead Live',
      checkedInAt: null,
      checkedInCount: 41,
      capacity: 120,
    });
  });

  it('falls back to zero capacity when Shows knows nothing of the gate', async () => {
    answer({
      'organizer.tickets.checkIn': scan,
      'shows.detail': { title: 'Radiohead Live' },
      'organizer.shows.capacity': [],
    });

    await expect(service.checkIn('u1', dto)).resolves.toEqual(
      expect.objectContaining({ capacity: 0 }),
    );
  });
});
