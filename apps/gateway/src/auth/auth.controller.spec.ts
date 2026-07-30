import { GatewayAuthController } from './auth.controller';

describe('GatewayAuthController', () => {
  const amqp = { request: jest.fn().mockResolvedValue('tokens') };
  const controller = new GatewayAuthController(amqp as never);

  it('forwards register/login/refresh over RPC and unwraps the response', async () => {
    await expect(
      controller.register({ email: 'a@b.com', password: 'password123' } as never),
    ).resolves.toBe('tokens');
    await expect(
      controller.login({ email: 'a@b.com', password: 'password123' } as never),
    ).resolves.toBe('tokens');
    await expect(controller.refresh({ refreshToken: 't' } as never)).resolves.toBe('tokens');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'auth.register',
        payload: { email: 'a@b.com', password: 'password123' },
      }),
    );
  });

  it('materialises the organizer before flipping the role, and returns the new tokens', async () => {
    amqp.request.mockClear();

    await expect(
      controller.becomeOrganizer({ user: { id: 'u1' } }, { name: 'Anna' }),
    ).resolves.toBe('tokens');

    expect(amqp.request.mock.calls.map(([opts]) => opts.routingKey)).toEqual([
      'organizer.profile.create',
      'auth.becomeOrganizer',
    ]);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.profile.create',
        payload: { userId: 'u1', name: 'Anna' },
      }),
    );
  });
});
