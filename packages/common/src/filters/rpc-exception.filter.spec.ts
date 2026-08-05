import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

// Import through the package barrel so index.ts is covered too.
import { RpcToHttpExceptionFilter } from '../index';

function mockHost() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return { res, host: { switchToHttp: () => ({ getResponse: () => res }) } as never };
}

describe('RpcToHttpExceptionFilter', () => {
  const filter = new RpcToHttpExceptionFilter();

  // rpcRequest rethrows a service error as `new HttpException(message, status)`, whose
  // getResponse() is the bare string — clients read `message`, so it has to be an object.
  it('wraps an HttpException carrying a string body into { statusCode, message }', () => {
    const { res, host } = mockHost();

    filter.catch(new HttpException('nope', HttpStatus.FORBIDDEN), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(res.json).toHaveBeenCalledWith({ statusCode: HttpStatus.FORBIDDEN, message: 'nope' });
  });

  it('passes an object body through untouched', () => {
    const { res, host } = mockHost();

    filter.catch(new BadRequestException('Unknown bandId abc'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unknown bandId abc' }),
    );
  });

  it('maps a plain RPC error with a numeric status', () => {
    const { res, host } = mockHost();

    filter.catch({ status: 404, message: 'Show not found' }, host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 404, message: 'Show not found' });
  });

  it('falls back to 500 for an unknown error', () => {
    const { res, host } = mockHost();

    filter.catch(new Error('boom'), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, message: 'boom' });
  });
});
