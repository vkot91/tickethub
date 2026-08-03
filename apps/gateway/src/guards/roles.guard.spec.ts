import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';

function ctx(user: { role: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(ctx({ role: 'user' }))).toBe(true);
  });
  it('blocks when the user lacks the required role', () => {
    const reflector = { getAllAndOverride: () => ['admin'] } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(ctx({ role: 'user' }))).toBe(false);
  });
  it('allows when the user has the required role', () => {
    const reflector = { getAllAndOverride: () => ['admin'] } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(ctx({ role: 'admin' }))).toBe(true);
  });
});
