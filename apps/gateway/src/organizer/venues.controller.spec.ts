import { GUARDS_METADATA } from '@nestjs/common/constants';

import { ROLES_KEY } from '@tickethub/common';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GatewayOrganizerVenuesController } from './venues.controller';

describe('GatewayOrganizerVenuesController', () => {
  const amqp = { request: jest.fn().mockResolvedValue('result') };
  const controller = new GatewayOrganizerVenuesController(amqp as never);

  it('forwards getList over RPC', async () => {
    await controller.getList();
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'venues.list', payload: {} }),
    );
  });

  it('forwards getOne by venue id', async () => {
    await controller.getOne('v1');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'venues.get', payload: { venueId: 'v1' } }),
    );
  });

  // Guards on the class, not the handlers: a route added later must be guarded by default.
  // Anonymous → 401 from JwtAuthGuard, a `user`-role token → 403 from RolesGuard.
  it('guards every route at the class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GatewayOrganizerVenuesController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, GatewayOrganizerVenuesController)).toEqual(['organizer']);
  });
});
