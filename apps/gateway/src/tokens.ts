// DI tokens for the gateway's RPC clients. Local to this app — not a cross-service contract.
export const RPC = {
  auth: 'AUTH_RPC',
  events: 'EVENTS_RPC',
  orders: 'ORDERS_RPC',
} as const;
