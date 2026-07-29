import { OrganizerShowsController } from './shows.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('OrganizerShowsController', () => {
  const svc = {
    showIds: jest.fn().mockResolvedValue(['s1']),
    myShows: jest.fn().mockResolvedValue([{ id: 's1' }]),
    createShow: jest.fn().mockResolvedValue({ id: 's1' }),
    updateShow: jest.fn().mockResolvedValue({ id: 's1' }),
    deleteShow: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new OrganizerShowsController(svc as never);

  it('delegates showIds, unwrapping the userId', async () => {
    await expect(controller.showIds({ userId: 'u1' })).resolves.toEqual(['s1']);
    expect(svc.showIds).toHaveBeenCalledWith('u1');
  });

  it('delegates myShows with its status filter', async () => {
    await expect(controller.myShows({ userId: 'u1', status: 'draft' })).resolves.toEqual([
      { id: 's1' },
    ]);
    expect(svc.myShows).toHaveBeenCalledWith('u1', { status: 'draft' });
  });

  it('delegates createShow', async () => {
    const dto = {
      title: 'T',
      description: '',
      venueId: 'v1',
      startsAt: '2026-01-01T00:00:00.000Z',
    };

    await controller.createShow({ userId: 'u1', dto });

    expect(svc.createShow).toHaveBeenCalledWith('u1', dto);
  });

  it('delegates updateShow', async () => {
    await controller.updateShow({ userId: 'u1', showId: 's1', dto: { title: 'T2' } });

    expect(svc.updateShow).toHaveBeenCalledWith('u1', 's1', { title: 'T2' });
  });

  it('delegates deleteShow', async () => {
    await controller.deleteShow({ userId: 'u1', showId: 's1' });

    expect(svc.deleteShow).toHaveBeenCalledWith('u1', 's1');
  });
});
