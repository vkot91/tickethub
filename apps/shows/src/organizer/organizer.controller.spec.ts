import { OrganizerController } from './organizer.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('OrganizerController', () => {
  const svc = {
    create: jest.fn().mockResolvedValue('org-1'),
  };
  const controller = new OrganizerController(svc as never);

  it('delegates create, unwrapping the params', async () => {
    await expect(controller.create({ userId: 'u1', name: 'Anna' })).resolves.toBe('org-1');
    expect(svc.create).toHaveBeenCalledWith('u1', 'Anna');
  });
});
