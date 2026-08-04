import { OrganizerShowsController } from './shows.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('OrganizerShowsController', () => {
  const svc = {
    showIds: jest.fn().mockResolvedValue(['s1']),
    capacity: jest.fn().mockResolvedValue([{ showId: 's1', capacity: 12 }]),
    myShows: jest.fn().mockResolvedValue([{ id: 's1' }]),
    createShow: jest.fn().mockResolvedValue({ id: 's1' }),
    updateShow: jest.fn().mockResolvedValue({ id: 's1' }),
    deleteShow: jest.fn().mockResolvedValue(undefined),
    getShow: jest.fn().mockResolvedValue({ id: 's1' }),
  };
  const publishing = {
    putPricing: jest.fn().mockResolvedValue(undefined),
    getPricing: jest.fn().mockResolvedValue({ ticketTypes: [], assignments: [] }),
    publishChecklist: jest.fn().mockResolvedValue({ hasTicketTypes: true }),
    publishShow: jest.fn().mockResolvedValue(undefined),
  };
  const poster = {
    posterUploadUrl: jest.fn().mockResolvedValue({ uploadUrl: 'u', posterUrl: 'p' }),
  };
  const controller = new OrganizerShowsController(
    svc as never,
    publishing as never,
    poster as never,
  );

  it('delegates showIds, unwrapping the userId', async () => {
    await expect(controller.showIds({ userId: 'u1' })).resolves.toEqual(['s1']);
    expect(svc.showIds).toHaveBeenCalledWith('u1');
  });

  it('delegates capacity, batched', async () => {
    await expect(controller.capacity({ showIds: ['s1'] })).resolves.toEqual([
      { showId: 's1', capacity: 12 },
    ]);
    expect(svc.capacity).toHaveBeenCalledWith(['s1']);
  });

  it('delegates myShows with its status filter', async () => {
    await expect(controller.myShows({ userId: 'u1', status: 'draft' })).resolves.toEqual([
      { id: 's1' },
    ]);
    expect(svc.myShows).toHaveBeenCalledWith('u1', { status: 'draft' });
  });

  it('delegates getShow', async () => {
    await expect(controller.getShow({ userId: 'u1', showId: 's1' })).resolves.toEqual({ id: 's1' });
    expect(svc.getShow).toHaveBeenCalledWith('u1', 's1');
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

  it('delegates putPricing to the publishing service', async () => {
    const dto = { ticketTypes: [], assignments: [] };

    await controller.putPricing({ userId: 'u1', showId: 's1', dto });

    expect(publishing.putPricing).toHaveBeenCalledWith('u1', 's1', dto);
  });

  it('delegates getPricing to the publishing service', async () => {
    await expect(controller.pricing({ userId: 'u1', showId: 's1' })).resolves.toEqual({
      ticketTypes: [],
      assignments: [],
    });
    expect(publishing.getPricing).toHaveBeenCalledWith('u1', 's1');
  });

  it('delegates publishChecklist', async () => {
    await expect(controller.publishChecklist({ userId: 'u1', showId: 's1' })).resolves.toEqual({
      hasTicketTypes: true,
    });
    expect(publishing.publishChecklist).toHaveBeenCalledWith('u1', 's1');
  });

  it('delegates publishShow', async () => {
    await controller.publishShow({ userId: 'u1', showId: 's1' });

    expect(publishing.publishShow).toHaveBeenCalledWith('u1', 's1');
  });

  it('delegates posterUploadUrl, unwrapping the content type out of the dto', async () => {
    await expect(
      controller.posterUploadUrl({ userId: 'u1', showId: 's1', dto: { contentType: 'image/png' } }),
    ).resolves.toEqual({ uploadUrl: 'u', posterUrl: 'p' });

    expect(poster.posterUploadUrl).toHaveBeenCalledWith('u1', 's1', 'image/png');
  });
});
