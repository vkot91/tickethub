// Transport-level names — the topology itself, everything not owned by one feature. Message
// patterns and routing keys are NOT here: each lives in its feature's `wire.ts`, next to the
// payload types it carries.
//
// Messaging vocabulary: "event" here always means an RMQ message. The ticketed thing people buy
// seats for is a "show".

// Durable RMQ exchanges. All domain events fan out through the topic exchange; all RPC
// requests route through the direct exchange (replies come back over Direct Reply-To).
export const EVENTS_EXCHANGE = 'tickethub.events';
export const RPC_EXCHANGE = 'tickethub.rpc';

// RMQ queue names. RPC handlers each bind their own queue named after the message-pattern
// routing key (golevelup runs one consumer per @RabbitRPC, so a shared per-service queue would
// make handlers compete and drop mismatched keys). Event queues: one per handler, bound to
// EVENTS_EXCHANGE by routing key — so each event type gets its own DLX and a new subscriber
// just binds its own queue (fan-out).
//
// One map, not one per feature: a queue belongs to the service that *consumes* it, so
// `orders.payment-succeeded` is Orders' queue for Payments' event and would otherwise be filed
// under whichever of the two the reader happened to be thinking of.
export const EVENTS_QUEUES = {
  ORDERS_PAYMENT_SUCCEEDED: 'orders.payment-succeeded',
  ORDERS_PAYMENT_FAILED: 'orders.payment-failed',
  ORDERS_REFUND_SUCCEEDED: 'orders.refund-succeeded',
  ORDERS_SHOW_CANCELLED: 'orders.show-cancelled',
  PAYMENTS_REFUND_REQUESTED: 'payments.refund-requested',
  PAYMENTS_ORDER_EXPIRED: 'payments.order-expired',
  FULFILLMENT_ORDER_PAID: 'fulfillment.order-paid',
  FULFILLMENT_TICKET_PDF_READY: 'fulfillment.ticket-pdf-ready',
} as const;

/** The name of any event queue — what `eventSub` accepts as its queue argument. */
export type EventQueue = (typeof EVENTS_QUEUES)[keyof typeof EVENTS_QUEUES];
