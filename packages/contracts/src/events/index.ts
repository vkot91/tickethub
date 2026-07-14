import { z } from 'zod';

export const EVENT_ROUTING_KEYS = {
  userRegistered: 'user.registered',
  eventPublished: 'event.published',
  eventCancelled: 'event.cancelled',
} as const;

// RMQ queue names shared between each service's server and its remote clients.
export const QUEUES = {
  authRpc: 'auth.rpc',
  eventsRpc: 'events.rpc',
  ordersRpc: 'orders.rpc',
  paymentsRpc: 'payments.rpc',
  authEvents: 'auth.events',
  ordersEvents: 'orders.events',
  paymentsEvents: 'payments.events',
  catalogEvents: 'catalog.events',
} as const;

// RPC message patterns: each pairs a service handler (@MessagePattern) with a caller (.send).
export const MESSAGE_PATTERNS = {
  auth: {
    register: 'auth.register',
    login: 'auth.login',
    refresh: 'auth.refresh',
    validate: 'auth.validate',
  },
  events: {
    catalog: 'events.catalog',
    detail: 'events.detail',
    seatMap: 'events.seatMap',
  },
  orders: {
    create: 'orders.create',
    get: 'orders.get',
    requestRefund: 'orders.requestRefund',
  },
  payments: {
    createIntent: 'payments.createIntent',
    webhook: 'payments.webhook',
  },
} as const;

export const userRegisteredSchema = z.object({
  messageId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
});
export type UserRegisteredEvent = z.infer<typeof userRegisteredSchema>;

export const eventPublishedSchema = z.object({
  messageId: z.string().uuid(),
  eventId: z.string().uuid(),
});
export type EventPublishedEvent = z.infer<typeof eventPublishedSchema>;
