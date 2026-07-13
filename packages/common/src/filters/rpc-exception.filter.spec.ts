import { HttpException, HttpStatus } from '@nestjs/common';
// Import through the package barrel so index.ts is covered too.
import { RpcToHttpExceptionFilter } from '../index';

function mockHost() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return { res, host: { switchToHttp: () => ({ getResponse: () => res }) } as never };
}

describe('RpcToHttpExceptionFilter', () => {
  const filter = new RpcToHttpExceptionFilter();

  it('maps an HttpException to its own status and body', () => {
    const { res, host } = mockHost();

    filter.catch(new HttpException('nope', HttpStatus.FORBIDDEN), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(res.json).toHaveBeenCalledWith('nope');
  });

  it('maps a plain RPC error with a numeric status', () => {
    const { res, host } = mockHost();

    filter.catch({ status: 404, message: 'Event not found' }, host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 404, message: 'Event not found' });
  });

  it('falls back to 500 for an unknown error', () => {
    const { res, host } = mockHost();

    filter.catch(new Error('boom'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: 'boom' });
  });
});
