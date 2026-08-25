import { SEAT_MAP_COALESCE_MS, SeatMapBroadcaster } from './seat-map.broadcaster';

describe('SeatMapBroadcaster', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses a burst on one show into a single broadcast', () => {
    const emit = jest.fn();
    const broadcaster = new SeatMapBroadcaster(emit);

    for (let i = 0; i < 8; i += 1) broadcaster.touch('e1');
    jest.advanceTimersByTime(SEAT_MAP_COALESCE_MS);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('e1');
  });

  it('does not emit before the window closes', () => {
    const emit = jest.fn();

    new SeatMapBroadcaster(emit).touch('e1');
    jest.advanceTimersByTime(SEAT_MAP_COALESCE_MS - 1);

    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps shows independent', () => {
    const emit = jest.fn();
    const broadcaster = new SeatMapBroadcaster(emit);

    broadcaster.touch('e1');
    broadcaster.touch('e2');
    jest.advanceTimersByTime(SEAT_MAP_COALESCE_MS);

    expect(emit.mock.calls.map(([showId]) => showId).sort()).toEqual(['e1', 'e2']);
  });

  it('broadcasts again for a change after the window closed', () => {
    const emit = jest.fn();
    const broadcaster = new SeatMapBroadcaster(emit);

    broadcaster.touch('e1');
    jest.advanceTimersByTime(SEAT_MAP_COALESCE_MS);
    broadcaster.touch('e1');
    jest.advanceTimersByTime(SEAT_MAP_COALESCE_MS);

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('stops pending timers on shutdown', () => {
    const emit = jest.fn();
    const broadcaster = new SeatMapBroadcaster(emit);

    broadcaster.touch('e1');
    broadcaster.onModuleDestroy();
    jest.advanceTimersByTime(SEAT_MAP_COALESCE_MS);

    expect(emit).not.toHaveBeenCalled();
  });
});
