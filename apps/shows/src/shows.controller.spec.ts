import { ShowsController } from './shows.controller';

describe('ShowsController', () => {
  const svc = {
    catalog: jest.fn().mockResolvedValue('cat'),
    detail: jest.fn().mockResolvedValue('det'),
    seatMap: jest.fn().mockResolvedValue('map'),
  };
  const controller = new ShowsController(svc as never);

  it('delegates catalog to the service', async () => {
    await controller.catalog({ limit: 20 } as never);
    expect(svc.catalog).toHaveBeenCalledWith({ limit: 20 });
  });

  it('delegates detail and seatMap, unwrapping the id', async () => {
    await controller.detail({ id: 'e1' });
    await controller.seatMap({ id: 'e1' });
    expect(svc.detail).toHaveBeenCalledWith('e1');
    expect(svc.seatMap).toHaveBeenCalledWith('e1');
  });
});
