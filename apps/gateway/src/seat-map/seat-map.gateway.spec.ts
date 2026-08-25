import { SEAT_MAP_EVENT, SEAT_MAP_ROOM } from './seat-map.broadcaster';
import { SeatMapGateway } from './seat-map.gateway';

const SHOW_ID = '00000000-0000-4000-8000-000000000001';

function socketFake() {
  return { join: jest.fn(), leave: jest.fn() };
}

describe('SeatMapGateway', () => {
  it('joins a client to the room for the show it names', () => {
    const socket = socketFake();

    new SeatMapGateway().subscribe(socket as never, { showId: SHOW_ID });

    expect(socket.join).toHaveBeenCalledWith(SEAT_MAP_ROOM(SHOW_ID));
  });

  it('leaves the room on unsubscribe', () => {
    const socket = socketFake();

    new SeatMapGateway().unsubscribe(socket as never, { showId: SHOW_ID });

    expect(socket.leave).toHaveBeenCalledWith(SEAT_MAP_ROOM(SHOW_ID));
  });

  it('ignores a subscribe without a valid show id rather than joining a junk room', () => {
    const socket = socketFake();

    new SeatMapGateway().subscribe(socket as never, { showId: '' });

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('broadcasts to the show room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const gateway = new SeatMapGateway();
    gateway.server = { to } as never;

    gateway.broadcast(SHOW_ID);

    expect(to).toHaveBeenCalledWith(SEAT_MAP_ROOM(SHOW_ID));
    expect(emit).toHaveBeenCalledWith(SEAT_MAP_EVENT, { showId: SHOW_ID });
  });
});
