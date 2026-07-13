import { AuthController } from './auth.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('AuthController', () => {
  const service = {
    register: jest.fn().mockResolvedValue('reg'),
    login: jest.fn().mockResolvedValue('log'),
    refresh: jest.fn().mockResolvedValue('ref'),
    validate: jest.fn().mockResolvedValue('val'),
  };
  const controller = new AuthController(service as any);

  it('delegates register/login/refresh to the service', async () => {
    await expect(
      controller.register({ email: 'a@b.com', password: 'password123' } as any),
    ).resolves.toBe('reg');
    await expect(
      controller.login({ email: 'a@b.com', password: 'password123' } as any),
    ).resolves.toBe('log');
    await expect(controller.refresh({ refreshToken: 't' } as any)).resolves.toBe('ref');
    expect(service.login).toHaveBeenCalled();
  });

  it('delegates validate, unwrapping the accessToken', async () => {
    await controller.validate({ accessToken: 'tok' });
    expect(service.validate).toHaveBeenCalledWith('tok');
  });
});
