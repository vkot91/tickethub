import { GatewayUserShowsController } from './shows.controller';

describe('GatewayUserShowsController', () => {
  const amqp = { request: jest.fn().mockResolvedValue('result') };
  const seatMapService = {
    get: jest.fn().mockResolvedValue({ showId: 'e1', sections: [], statuses: {} }),
  };
  const controller = new GatewayUserShowsController(amqp as never, seatMapService as never);

  it('parses the query and forwards catalog over RPC', async () => {
    await controller.catalog({ limit: '5' });
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'user.shows.catalog', payload: { limit: 5 } }),
    );
  });

  it('rejects an invalid catalog query', () => {
    expect(() => controller.catalog({ limit: '999' })).toThrow();
  });

  it('forwards detail by id', async () => {
    await controller.detail('e1');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'user.shows.detail', payload: { id: 'e1' } }),
    );
  });

  it('delegates the seat map to the stitching service', async () => {
    await controller.seatMap('e1');

    expect(seatMapService.get).toHaveBeenCalledWith('e1');
  });
});
