import { type Metadata } from 'next';

import { OrderList } from '@/features/orders/order-list';

export const metadata: Metadata = { title: 'My orders' };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-295 [animation:var(--animate-fade)] px-6 pt-9 pb-22.5">
      <h1 className="mb-2 font-display text-[32px] font-semibold tracking-[-0.02em]">My orders</h1>
      <p className="mb-8 text-[15px] text-fg-muted">
        Everything you have booked, newest first. Unpaid orders keep their seats for ten minutes.
      </p>

      <OrderList />
    </div>
  );
}
