import { OrganizerCheckInController } from './check-in.controller';

describe('OrganizerCheckInController', () => {
  const checkInService = { checkIn: jest.fn().mockResolvedValue({ result: 'valid' }) };
  const controller = new OrganizerCheckInController(checkInService as never);

  it('forwards the code and the gate’s show to the service', async () => {
    await expect(controller.checkIn({ code: 'tok', showId: 's1' })).resolves.toEqual({
      result: 'valid',
    });

    expect(checkInService.checkIn).toHaveBeenCalledWith('tok', 's1');
  });
});
