import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@tickethub/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GatewayOrganizerShowsController } from './shows.controller';

describe('GatewayOrganizerShowsController', () => {
  const amqp = { request: jest.fn().mockResolvedValue('result') };
  const controller = new GatewayOrganizerShowsController(amqp as never);
  const req = { user: { id: 'u1' } };
  const startsAt = '2026-12-01T20:00:00.000Z';

  beforeEach(() => amqp.request.mockClear());

  it('forwards the show list with the caller and no filter', async () => {
    await controller.getList(req, {});

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.myShows',
        payload: { userId: 'u1' },
      }),
    );
  });

  it('passes a status filter through', async () => {
    await controller.getList(req, { status: 'draft' });

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { userId: 'u1', status: 'draft' } }),
    );
  });

  // The parse runs before the RPC, so a bad query never reaches the broker. Asserting the
  // exception *type* matters: a bare `.toThrow()` is satisfied by the raw ZodError a plain
  // `schema.parse()` throws, which Nest renders as a 500 — bad input has to be a 400.
  it('rejects a status that is not a show status', () => {
    expect(() => controller.getList(req, { status: 'sold-out' })).toThrow(BadRequestException);
    expect(amqp.request).not.toHaveBeenCalled();
  });

  it('forwards a create with the parsed dto', async () => {
    const dto = {
      title: 'Neon Nights',
      description: 'Synths',
      venueId: crypto.randomUUID(),
      startsAt,
    };

    await controller.create(req, dto);

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.createShow',
        payload: { userId: 'u1', dto },
      }),
    );
  });

  it('rejects a create with no title before it reaches the service', () => {
    expect(() => controller.create(req, { description: '', venueId: 'x', startsAt })).toThrow(
      BadRequestException,
    );
    expect(amqp.request).not.toHaveBeenCalled();
  });

  it('forwards a partial update by show id', async () => {
    await controller.update(req, 's1', { title: 'Renamed' });

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.updateShow',
        payload: { userId: 'u1', showId: 's1', dto: { title: 'Renamed' } },
      }),
    );
  });

  it('forwards a delete by show id', async () => {
    await controller.remove(req, 's1');

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.deleteShow',
        payload: { userId: 'u1', showId: 's1' },
      }),
    );
  });

  it('forwards a publish-checklist read by show id', async () => {
    await controller.publishChecklist(req, 's1');

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.publishChecklist',
        payload: { userId: 'u1', showId: 's1' },
      }),
    );
  });

  it('forwards a publish by show id', async () => {
    await controller.publish(req, 's1');

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.publishShow',
        payload: { userId: 'u1', showId: 's1' },
      }),
    );
  });

  it('forwards pricing with the parsed dto', async () => {
    const dto = {
      ticketTypes: [{ key: 'vip', name: 'VIP', tier: 'vip', priceCents: 9000 }],
      assignments: [{ sectionId: crypto.randomUUID(), ticketTypeKey: 'vip' }],
    };

    await controller.putPricing(req, 's1', dto);

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.putPricing',
        payload: { userId: 'u1', showId: 's1', dto },
      }),
    );
  });

  it('rejects a negative price before it reaches the service', () => {
    expect(() =>
      controller.putPricing(req, 's1', {
        ticketTypes: [{ key: 'vip', name: 'VIP', tier: 'vip', priceCents: -1 }],
        assignments: [],
      }),
    ).toThrow(BadRequestException);
    expect(amqp.request).not.toHaveBeenCalled();
  });

  it('forwards a poster upload-url request with the parsed content type', async () => {
    await controller.posterUploadUrl(req, 's1', { contentType: 'image/png' });

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'organizer.posterUploadUrl',
        payload: { userId: 'u1', showId: 's1', dto: { contentType: 'image/png' } },
      }),
    );
  });

  it('rejects a content type outside the three image types', () => {
    // The signature pins this value onto the object, so anything that gets past here is what the
    // public bucket ends up serving — `text/html` included.
    expect(() => controller.posterUploadUrl(req, 's1', { contentType: 'text/html' })).toThrow(
      BadRequestException,
    );
    expect(amqp.request).not.toHaveBeenCalled();
  });

  // Guards on the class, not the handlers: a route added later must be guarded by default.
  // Anonymous → 401 from JwtAuthGuard, a `user`-role token → 403 from RolesGuard.
  it('guards every route at the class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GatewayOrganizerShowsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, GatewayOrganizerShowsController)).toEqual(['organizer']);
  });
});
