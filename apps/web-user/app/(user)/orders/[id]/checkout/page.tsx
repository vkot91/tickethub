import { type Metadata } from 'next';

import { Checkout } from '@/features/checkout/checkout';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-295 [animation:var(--animate-fade)] px-6 pt-7 pb-22.5">
      <Checkout orderId={id} />
    </div>
  );
}
