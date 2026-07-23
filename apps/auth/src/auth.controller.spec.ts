import { AuthController } from './auth.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('AuthController', () => {
  const service = {
    register: jest.fn().mockResolvedValue('reg'),
    login: jest.fn().mockResolvedValue('log'),
    refresh: jest.fn().mockResolvedValue('ref'),
    validate: jest.fn().mockResolvedValue('val'),
    getUser: jest.fn().mockResolvedValue({ userId: 'u1', email: 'a@b.com' }),
  };
  const controller = new AuthController(service as never);

  it('delegates register/login/refresh to the service', async () => {
    await expect(
      controller.register({ email: 'a@b.com', password: 'password123' } as never),
    ).resolves.toBe('reg');
    await expect(
      controller.login({ email: 'a@b.com', password: 'password123' } as never),
    ).resolves.toBe('log');
    await expect(controller.refresh({ refreshToken: 't' } as never)).resolves.toBe('ref');
    expect(service.login).toHaveBeenCalled();
  });

  it('delegates validate, unwrapping the accessToken', async () => {
    await controller.validate({ accessToken: 'tok' });
    expect(service.validate).toHaveBeenCalledWith('tok');
  });

  it('delegates getUser, unwrapping the userId', async () => {
    await expect(controller.getUser({ userId: 'u1' })).resolves.toEqual({
      userId: 'u1',
      email: 'a@b.com',
    });
    expect(service.getUser).toHaveBeenCalledWith('u1');
  });
});
