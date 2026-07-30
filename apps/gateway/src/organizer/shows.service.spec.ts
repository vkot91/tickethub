import { NotFoundException } from '@nestjs/common';
import { OrganizerShowsService } from './shows.service';

function makeService(showIds: string[]) {
  const amqp = { request: jest.fn().mockResolvedValue(showIds) };
  return { svc: new OrganizerShowsService(amqp as never), amqp };
}

describe('OrganizerShowsService', () => {
  it('resolves the caller’s show ids over RPC', async () => {
    const { svc, amqp } = makeService(['s1', 's2']);

    await expect(svc.showIds('u1')).resolves.toEqual(['s1', 's2']);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.profile.showIds',
        payload: { userId: 'u1' },
      }),
    );
  });

  it('returns the id list when the show is owned', async () => {
    const { svc } = makeService(['s1', 's2']);

    await expect(svc.assertOwnsShow('u1', 's2')).resolves.toEqual(['s1', 's2']);
  });

  it('404s on someone else’s show rather than leaking its existence', async () => {
    const { svc } = makeService(['s1']);

    await expect(svc.assertOwnsShow('u1', 'other')).rejects.toThrow(NotFoundException);
  });
});
