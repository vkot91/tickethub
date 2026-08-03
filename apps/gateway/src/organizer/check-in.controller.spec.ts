import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { ROLES_KEY } from '@tickethub/common';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GatewayOrganizerCheckInController } from './check-in.controller';

// The merge lives in `check-in.service.ts` and is tested there. All this controller owns is the
// parse, the delegation and the guards.
describe('GatewayOrganizerCheckInController', () => {
  const req = { user: { id: 'u1' } };

  const checkInService = { checkIn: jest.fn().mockResolvedValue({ result: 'valid' }) };
  const controller = new GatewayOrganizerCheckInController(checkInService as never);

  beforeEach(() => checkInService.checkIn.mockClear());

  const SHOW_ID = '11111111-1111-4111-8111-111111111111';

  it('passes the caller and the parsed scan to the service', async () => {
    await expect(controller.checkIn(req, { code: 'tok', showId: SHOW_ID })).resolves.toEqual({
      result: 'valid',
    });

    expect(checkInService.checkIn).toHaveBeenCalledWith('u1', { code: 'tok', showId: SHOW_ID });
  });

  // Asserting the exception *type*: a raw ZodError renders as a 500, and bad input is a 400.
  it('rejects an empty code before reaching the service', () => {
    expect(() => controller.checkIn(req, { code: '', showId: SHOW_ID })).toThrow(
      BadRequestException,
    );

    expect(checkInService.checkIn).not.toHaveBeenCalled();
  });

  // Without a gate there is no scan to make — a scan scoped to "any show" is the bug this closes.
  it('rejects a scan that names no gate', () => {
    expect(() => controller.checkIn(req, { code: 'tok' })).toThrow(BadRequestException);

    expect(checkInService.checkIn).not.toHaveBeenCalled();
  });

  it('rejects a gate that is not a uuid', () => {
    expect(() => controller.checkIn(req, { code: 'tok', showId: 'tonight' })).toThrow(
      BadRequestException,
    );

    expect(checkInService.checkIn).not.toHaveBeenCalled();
  });

  it('is guarded and organizer-only at the class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GatewayOrganizerCheckInController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, GatewayOrganizerCheckInController)).toEqual([
      'organizer',
    ]);
  });
});
