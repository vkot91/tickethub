import { OrganizerProfileController } from './profile.controller';

describe('OrganizerProfileController', () => {
  const svc = {
    create: jest.fn().mockResolvedValue('org-1'),
  };
  const controller = new OrganizerProfileController(svc as never);

  it('delegates create, unwrapping the params', async () => {
    await expect(controller.create({ userId: 'u1', name: 'Anna' })).resolves.toBe('org-1');
    expect(svc.create).toHaveBeenCalledWith('u1', 'Anna');
  });
});
