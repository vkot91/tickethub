import { GatewayShowsController } from './shows.controller';

describe('GatewayShowsController', () => {
  const amqp = { request: jest.fn().mockResolvedValue('result') };
  const controller = new GatewayShowsController(amqp as never);

  it('parses the query and forwards catalog over RPC', async () => {
    await controller.catalog({ limit: '5' });
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'shows.catalog', payload: { limit: 5 } }),
    );
  });

  it('rejects an invalid catalog query', () => {
    expect(() => controller.catalog({ limit: '999' })).toThrow();
  });

  it('forwards detail and seatMap by id', async () => {
    await controller.detail('e1');
    await controller.seatMap('e1');
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'shows.detail', payload: { id: 'e1' } }),
    );
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({ routingKey: 'shows.seatMap', payload: { id: 'e1' } }),
    );
  });
});
