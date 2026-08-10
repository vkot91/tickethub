import { getTableConfig } from 'drizzle-orm/pg-core';

import { tickets, ticketsOutbox, ticketsProcessedMessages, ticketsSchema } from './tickets';

describe('tickets schema', () => {
  it('uses the tickets postgres schema', () => {
    expect(ticketsSchema.schemaName).toBe('tickets');
  });

  it('tickets is one row per seat, not per order', () => {
    expect(Object.keys(tickets)).toEqual(
      expect.arrayContaining([
        'id',
        'orderId',
        'userId',
        'showId',
        'seatId',
        'seatLabel',
        'tier',
        'qrToken',
        's3Key',
        'checkedInAt',
        'createdAt',
      ]),
    );
  });

  it('is unique per (order, seat) so a redelivered order.paid cannot mint a second ticket', () => {
    const { uniqueConstraints } = getTableConfig(tickets);

    const orderSeatUnique = uniqueConstraints.find((constraint) =>
      constraint.columns.map((column) => column.name).includes('seat_id'),
    );

    expect(orderSeatUnique?.columns.map((column) => column.name)).toEqual(['order_id', 'seat_id']);
  });

  it('leaves a ticket un-checked-in until a gate scans it', () => {
    const { columns } = getTableConfig(tickets);

    const checkedInAt = columns.find((column) => column.name === 'checked_in_at');

    expect(checkedInAt?.notNull).toBe(false);
  });

  it('persists what was sold — the seat label and price tier are not re-derived later', () => {
    const { columns } = getTableConfig(tickets);
    const notNullNames = columns.filter((column) => column.notNull).map((column) => column.name);

    expect(notNullNames).toEqual(expect.arrayContaining(['seat_label', 'tier']));
  });

  it('reuses the outbox factory for the tickets schema', () => {
    expect(Object.keys(ticketsOutbox)).toEqual(
      expect.arrayContaining(['routingKey', 'payload', 'publishedAt']),
    );
  });

  it('reuses the processed-messages factory for the tickets schema', () => {
    expect(Object.keys(ticketsProcessedMessages)).toEqual(
      expect.arrayContaining(['messageId', 'processedAt']),
    );
  });
});
