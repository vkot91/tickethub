import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@tickethub/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GatewayOrganizerStatsController } from './stats.controller';

describe('GatewayOrganizerStatsController', () => {
  const statsService = {
    stats: jest.fn().mockResolvedValue('stats'),
    recentOrders: jest.fn().mockResolvedValue({ items: [] }),
  };
  const controller = new GatewayOrganizerStatsController(statsService as never);
  const req = { user: { id: 'u1' } };

  beforeEach(() => jest.clearAllMocks());

  it('passes the parsed query through with the caller', async () => {
    await controller.stats(req, { showId: '11111111-1111-4111-8111-111111111111' });

    expect(statsService.stats).toHaveBeenCalledWith('u1', {
      showId: '11111111-1111-4111-8111-111111111111',
    });
  });

  // A raw ZodError renders as a 500; malformed input has to be a 400.
  it('rejects a showId that is not a uuid before calling the service', () => {
    expect(() => controller.stats(req, { showId: 'not-a-uuid' })).toThrow(BadRequestException);
    expect(statsService.stats).not.toHaveBeenCalled();
  });

  it('asks for one page of recent orders', async () => {
    await controller.recentOrders(req);

    expect(statsService.recentOrders).toHaveBeenCalledWith('u1', 10);
  });

  it('is guarded for organizers at the class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GatewayOrganizerStatsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, GatewayOrganizerStatsController)).toEqual(['organizer']);
  });
});
