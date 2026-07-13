import { ConflictException, NotFoundException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
// Import through the package barrel so index.ts is covered too.
import { HttpToRpcExceptionFilter } from '../index';

describe('HttpToRpcExceptionFilter', () => {
  const filter = new HttpToRpcExceptionFilter();

  // Flat `{ status, message }` is what the gateway filter reads; assert the wire shape directly.
  const emitted = (exception: ConflictException | NotFoundException) =>
    firstValueFrom(filter.catch(exception, {} as never)).catch((e: unknown) => e);

  it('preserves a 409 across the RPC boundary', async () => {
    expect(await emitted(new ConflictException('Seat already reserved'))).toEqual({
      status: 409,
      message: 'Seat already reserved',
    });
  });

  it('preserves a 404 across the RPC boundary', async () => {
    expect(await emitted(new NotFoundException('Order not found'))).toEqual({
      status: 404,
      message: 'Order not found',
    });
  });
});
