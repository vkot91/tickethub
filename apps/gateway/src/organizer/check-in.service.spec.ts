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

  /** One entry per routing key, so a second one turning up here is a failure, not a stub miss. */
  const answer = (byKey: Record<string, unknown>) =>
    amqp.request.mockImplementation(({ routingKey }: { routingKey: string }) =>
      routingKey in byKey ? byKey[routingKey] : Promise.reject(new Error(`no stub: ${routingKey}`)),
    );

  beforeEach(() => {
    amqp.request.mockReset();
    myShows.assertOwnsShow.mockReset().mockResolvedValue([SHOW_ID]);
  });

  it('answers Fulfillment’s verdict as it stands', async () => {
    answer({ 'organizer.tickets.checkIn': scan });

    await expect(service.checkIn('u1', dto)).resolves.toEqual(scan);
  });

  // The title and the seat count are gate constants the scanner already holds from the show it
  // picked. Fetching them per scan was two RPCs a scan to re-send a number that cannot change.
  it('asks Shows nothing — one scan is one RPC behind the ownership check', async () => {
    answer({ 'organizer.tickets.checkIn': scan });

    await service.checkIn('u1', dto);

    expect(amqp.request).toHaveBeenCalledTimes(1);
  });

  it('hands Fulfillment the one gate, never the user and never a list', async () => {
    answer({ 'organizer.tickets.checkIn': scan });

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
    answer({ 'organizer.tickets.checkIn': scan });

    await service.checkIn('u1', dto);

    expect(myShows.assertOwnsShow).toHaveBeenCalledWith('u1', SHOW_ID);
  });

  // The counter describes the gate, so a rejection carries it exactly like an admission.
  it('passes a rejection through with the gate’s counter intact', async () => {
    const rejected = {
      result: 'wrongShow' as const,
      seatLabel: null,
      checkedInAt: null,
      checkedInCount: 41,
    };

    answer({ 'organizer.tickets.checkIn': rejected });

    await expect(service.checkIn('u1', dto)).resolves.toEqual(rejected);
  });
});
