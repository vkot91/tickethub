// Messaging vocabulary: "event" here always means an RMQ message. The ticketed thing people
// buy seats for is a "show" (see ../dto/shows, which owns the show event payload schemas).
export const USER_ROUTING_KEYS = {
  USER_REGISTERED: 'user.registered',
} as const;

export const SHOW_ROUTING_KEYS = {
  SHOW_PUBLISHED: 'show.published',
  SHOW_CANCELLED: 'show.cancelled',
} as const;

export const ORDER_ROUTING_KEYS = {
  ORDER_AWAITING_PAYMENT: 'order.awaiting_payment',
  ORDER_PAID: 'order.paid',
  ORDER_EXPIRED: 'order.expired',
  ORDER_CANCELLED: 'order.cancelled',
  SEAT_HELD: 'seat.held',
  SEAT_RELEASED: 'seat.released',
  REFUND_REQUESTED: 'refund.requested',
} as const;

export const PAYMENT_ROUTING_KEYS = {
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_SUCCEEDED: 'refund.succeeded',
} as const;

export const TICKET_ROUTING_KEYS = {
  TICKET_PDF_READY: 'ticket.pdf_ready',
} as const;

// Durable RMQ exchanges. All domain events fan out through the topic exchange; all RPC
// requests route through the direct exchange (replies come back over Direct Reply-To).
export const EVENTS_EXCHANGE = 'tickethub.events';
export const RPC_EXCHANGE = 'tickethub.rpc';

// RMQ queue names. RPC handlers each bind their own queue named after the message-pattern
// routing key (golevelup runs one consumer per @RabbitRPC, so a shared per-service queue would
// make handlers compete and drop mismatched keys). Event queues: one per handler, bound to
// EVENTS_EXCHANGE by routing key — so each event type gets its own DLX and a new subscriber
// just binds its own queue (fan-out).
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

export const AUTH_MESSAGE_PATTERNS = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH: 'auth.refresh',
  VALIDATE: 'auth.validate',
  GET_USER: 'auth.getUser',
  BECOME_ORGANIZER: 'auth.becomeOrganizer',
} as const;

// The buyer-facing surface of apps/shows: catalog reads, no auth.
export const SHOWS_MESSAGE_PATTERNS = {
  CATALOG: 'shows.catalog',
  DETAIL: 'shows.detail',
  SEAT_MAP: 'shows.seatMap',
} as const;

// The organizer-facing surface of the same service. A separate map because it is a separate
// audience with a separate controller — the import line then says which surface a file talks to.
export const ORGANIZER_MESSAGE_PATTERNS = {
  CREATE: 'organizer.create',
  SHOW_IDS: 'organizer.showIds',
} as const;

export const ORDERS_MESSAGE_PATTERNS = {
  CREATE: 'orders.create',
  GET: 'orders.get',
  LIST: 'orders.list',
  REQUEST_REFUND: 'orders.requestRefund',
} as const;

export const TICKETS_MESSAGE_PATTERNS = {
  LIST: 'tickets.list',
  PDF_URL: 'tickets.pdfUrl',
} as const;

export const PAYMENTS_MESSAGE_PATTERNS = {
  CREATE_INTENT: 'payments.createIntent',
  WEBHOOK: 'payments.webhook',
} as const;
