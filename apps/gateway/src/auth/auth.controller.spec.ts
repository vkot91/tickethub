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
});
