import { of } from 'rxjs';
import { GatewayEventsController } from './events.controller';

describe('GatewayEventsController', () => {
  const events = { send: jest.fn().mockReturnValue(of('result')) };
  const controller = new GatewayEventsController(events as never);

  it('parses the query and forwards catalog over RPC', async () => {
    await controller.catalog({ limit: '5' });
    expect(events.send).toHaveBeenCalledWith('events.catalog', { limit: 5 });
  });

  it('rejects an invalid catalog query', () => {
    expect(() => controller.catalog({ limit: '999' })).toThrow();
  });

  it('forwards detail and seatMap by id', async () => {
    await controller.detail('e1');
    await controller.seatMap('e1');
    expect(events.send).toHaveBeenCalledWith('events.detail', { id: 'e1' });
    expect(events.send).toHaveBeenCalledWith('events.seatMap', { id: 'e1' });
  });
});
