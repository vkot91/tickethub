export type OrderStatus = 'awaiting_payment' | 'paid' | 'expired' | 'cancelled' | 'refunded';

const EDGES: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['paid', 'expired', 'cancelled'],
  paid: ['refunded'],
  expired: [],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return EDGES[from].includes(to);
}
