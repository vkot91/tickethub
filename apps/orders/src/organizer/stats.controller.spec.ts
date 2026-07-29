import { OrganizerStatsController } from './stats.controller';

describe('OrganizerStatsController', () => {
  const statsService = {
    stats: jest.fn().mockResolvedValue({}),
    recent: jest.fn().mockResolvedValue([]),
  };
  const controller = new OrganizerStatsController(statsService as never);

  it('forwards stats to the service', () => {
    controller.stats({ showIds: ['s1'], from: '2026-07-01T00:00:00.000Z' });

    expect(statsService.stats).toHaveBeenCalledWith({
      showIds: ['s1'],
      from: '2026-07-01T00:00:00.000Z',
    });
  });

  it('forwards recent to the service', () => {
    controller.recent({ showIds: ['s1'], limit: 5 });

    expect(statsService.recent).toHaveBeenCalledWith({ showIds: ['s1'], limit: 5 });
  });
});
