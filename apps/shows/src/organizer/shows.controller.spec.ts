import { OrganizerShowsController } from './shows.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('OrganizerShowsController', () => {
  const svc = { showIds: jest.fn().mockResolvedValue(['s1']) };
  const controller = new OrganizerShowsController(svc as never);

  it('delegates showIds, unwrapping the userId', async () => {
    await expect(controller.showIds({ userId: 'u1' })).resolves.toEqual(['s1']);
    expect(svc.showIds).toHaveBeenCalledWith('u1');
  });
});
