import { of } from 'rxjs';
import { GatewayAuthController } from './auth.controller';

describe('GatewayAuthController', () => {
  const auth = { send: jest.fn().mockReturnValue(of('tokens')) };
  const controller = new GatewayAuthController(auth as never);

  it('forwards register/login/refresh over RPC and unwraps the response', async () => {
    await expect(
      controller.register({ email: 'a@b.com', password: 'password123' } as never),
    ).resolves.toBe('tokens');
    await expect(
      controller.login({ email: 'a@b.com', password: 'password123' } as never),
    ).resolves.toBe('tokens');
    await expect(controller.refresh({ refreshToken: 't' } as never)).resolves.toBe('tokens');
    expect(auth.send).toHaveBeenCalledWith('auth.register', {
      email: 'a@b.com',
      password: 'password123',
    });
  });
});
