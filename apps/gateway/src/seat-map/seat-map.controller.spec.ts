import { SeatMapEventsController } from './seat-map.controller';

describe('SeatMapEventsController', () => {
  const event = { messageId: 'm1', showId: 'e1' };

  it.each([['onSeatHeld' as const], ['onSeatReleased' as const], ['onOrderPaid' as const]])(
    '%s touches the show',
    (handler) => {
      const broadcaster = { touch: jest.fn() };

      new SeatMapEventsController(broadcaster as never)[handler](event as never);

      expect(broadcaster.touch).toHaveBeenCalledWith('e1');
    },
  );
});
