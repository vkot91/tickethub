import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  fulfillmentSchema,
  tickets,
  fulfillmentOutbox,
  fulfillmentProcessedMessages,
} from './fulfillment';

describe('fulfillment schema', () => {
  it('uses the fulfillment postgres schema', () => {
    expect(fulfillmentSchema.schemaName).toBe('fulfillment');
  });

  it('tickets table exposes order + s3 + qr columns', () => {
    expect(Object.keys(tickets)).toEqual(
      expect.arrayContaining(['id', 'orderId', 's3Key', 'qrToken', 'createdAt']),
    );
  });

  it('tickets.orderId is unique so a duplicate order.paid cannot mint two tickets', () => {
    const { uniqueConstraints } = getTableConfig(tickets);

    const orderIdUniqueConstraint = uniqueConstraints.find((constraint) =>
      constraint.columns.map((column) => column.name).includes('order_id'),
    );

    expect(orderIdUniqueConstraint).toBeDefined();
    expect(orderIdUniqueConstraint?.columns.map((column) => column.name)).toEqual(['order_id']);
  });

  it('reuses the outbox factory for the fulfillment schema', () => {
    expect(Object.keys(fulfillmentOutbox)).toEqual(
      expect.arrayContaining(['routingKey', 'payload', 'publishedAt']),
    );
  });

  it('reuses the processed-messages factory for the fulfillment schema', () => {
    expect(Object.keys(fulfillmentProcessedMessages)).toEqual(
      expect.arrayContaining(['messageId', 'processedAt']),
    );
  });
});
