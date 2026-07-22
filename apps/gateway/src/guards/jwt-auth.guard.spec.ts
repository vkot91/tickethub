import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(headers: Record<string, string>) {
  const req: Record<string, unknown> = { headers };
  return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never };
}

describe('JwtAuthGuard', () => {
  it('attaches the validated user and allows the request', async () => {
    const amqp = { request: jest.fn().mockResolvedValue({ id: 'u1', role: 'user' }) };
    const { req, ctx: c } = ctx({ authorization: 'Bearer good-token' });

    await expect(new JwtAuthGuard(amqp as never).canActivate(c)).resolves.toBe(true);
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'auth.validate',
        payload: { accessToken: 'good-token' },
      }),
    );
    expect(req.user).toEqual({ id: 'u1', role: 'user' });
  });

  it('rejects a request without a token', async () => {
    const amqp = { request: jest.fn() };
    const { ctx: c } = ctx({});
    await expect(new JwtAuthGuard(amqp as never).canActivate(c)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(amqp.request).not.toHaveBeenCalled();
  });

  it('rejects when validation fails downstream', async () => {
    const amqp = { request: jest.fn().mockRejectedValue(new Error('invalid')) };
    const { ctx: c } = ctx({ authorization: 'Bearer bad-token' });
    await expect(new JwtAuthGuard(amqp as never).canActivate(c)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
