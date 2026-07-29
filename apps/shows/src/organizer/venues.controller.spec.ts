import { OrganizerVenuesController } from './venues.controller';

// Thin RPC controller — verify each pattern delegates to the matching service method.
describe('OrganizerVenuesController', () => {
  const svc = {
    getList: jest.fn().mockResolvedValue([{ id: 'v1' }]),
    getOne: jest.fn().mockResolvedValue({ venue: { id: 'v1' }, sections: [] }),
  };
  const controller = new OrganizerVenuesController(svc as never);

  it('delegates getList', async () => {
    await expect(controller.getList()).resolves.toEqual([{ id: 'v1' }]);
    expect(svc.getList).toHaveBeenCalled();
  });

  it('delegates getOne, unwrapping the venueId', async () => {
    await expect(controller.getOne({ venueId: 'v1' })).resolves.toEqual({
      venue: { id: 'v1' },
      sections: [],
    });
    expect(svc.getOne).toHaveBeenCalledWith('v1');
  });
});
