import { OrganizerStatsController } from './stats.controller';

describe('OrganizerStatsController', () => {
  const statsService = { checkedInCount: jest.fn().mockResolvedValue(3) };
  const controller = new OrganizerStatsController(statsService as never);

  it('forwards checkedInCount to the service', async () => {
    await expect(controller.checkedInCount({ showIds: ['s1'] })).resolves.toBe(3);

    expect(statsService.checkedInCount).toHaveBeenCalledWith(['s1']);
  });
});
