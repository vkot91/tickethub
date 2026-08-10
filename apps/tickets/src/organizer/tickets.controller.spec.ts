import { OrganizerTicketsController } from './tickets.controller';

describe('OrganizerTicketsController', () => {
  const checkInService = {
    checkIn: jest.fn().mockResolvedValue({ result: 'valid' }),
    checkedInCount: jest.fn().mockResolvedValue(3),
  };
  const controller = new OrganizerTicketsController(checkInService as never);

  it('forwards the code and the gate’s show to the service', async () => {
    await expect(controller.checkIn({ code: 'tok', showId: 's1' })).resolves.toEqual({
      result: 'valid',
    });

    expect(checkInService.checkIn).toHaveBeenCalledWith('tok', 's1');
  });

  it('forwards checkedInCount to the service', async () => {
    await expect(controller.checkedInCount({ showIds: ['s1'] })).resolves.toBe(3);

    expect(checkInService.checkedInCount).toHaveBeenCalledWith(['s1']);
  });
});
