import { UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctx(headers: Record<string, string>) {
  const req: Record<string, unknown> = { headers };
  return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never };
}

describe('JwtAuthGuard', () => {
  it('attaches the validated user and allows the request', async () => {
    const auth = { send: jest.fn().mockReturnValue(of({ id: 'u1', role: 'user' })) };
    const { req, ctx: c } = ctx({ authorization: 'Bearer good-token' });

    await expect(new JwtAuthGuard(auth as never).canActivate(c)).resolves.toBe(true);
    expect(auth.send).toHaveBeenCalledWith('auth.validate', { accessToken: 'good-token' });
    expect(req.user).toEqual({ id: 'u1', role: 'user' });
  });

  it('rejects a request without a token', async () => {
    const auth = { send: jest.fn() };
    const { ctx: c } = ctx({});
    await expect(new JwtAuthGuard(auth as never).canActivate(c)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(auth.send).not.toHaveBeenCalled();
  });

  it('rejects when validation fails downstream', async () => {
    const auth = { send: jest.fn().mockReturnValue(throwError(() => new Error('invalid'))) };
    const { ctx: c } = ctx({ authorization: 'Bearer bad-token' });
    await expect(new JwtAuthGuard(auth as never).canActivate(c)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
