'use client';

import { Elements } from '@stripe/react-stripe-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { Card, Skeleton } from '@tickethub/ui';
import { getStripe, stripeAppearance } from '@/lib/stripe';

import { fetchOrder, isSettled, ORDER_POLL_MS, orderKeys } from '@/features/orders/api';

import { createPaymentIntent } from './api';
import { CheckoutResult } from './checkout-result';
import { HoldTimer } from './hold-timer';
import { OrderSummary } from './order-summary';
import { PaymentForm } from './payment-form';

export function Checkout({ orderId }: { orderId: string }) {
  // Set once the card is confirmed, while the webhook and saga catch up.
  const [isAwaitingSaga, setIsAwaitingSaga] = useState(false);

  const queryClient = useQueryClient();

  const { data: order, isPending } = useQuery({
    queryKey: orderKeys.byId(orderId),
    queryFn: () => fetchOrder(orderId),
    // Poll only while the order can still change: after confirming a card, or when the hold
    // is running out and the server is about to expire it.
    refetchInterval: (query) => {
      const status = query.state.data?.status;

      return status && !isSettled(status) ? ORDER_POLL_MS : false;
    },
  });

  const refetchOrder = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orderKeys.byId(orderId) }),
    [queryClient, orderId],
  );

  const isPayable = order?.status === 'awaiting_payment' && !isAwaitingSaga;

  const { data: intent } = useQuery({
    queryKey: orderKeys.paymentIntent(orderId),
    queryFn: () => createPaymentIntent(orderId),
    enabled: isPayable,
    staleTime: Infinity,
  });

  if (isPending || !order) return <CheckoutSkeleton />;

  if (isSettled(order.status)) {
    return <CheckoutResult order={{ ...order, status: order.status }} />;
  }

  if (isAwaitingSaga) {
    return (
      <Card radius="panel" padding="lg" className="mx-auto max-w-130 text-center">
        <h1 className="mb-2 font-display text-2xl font-semibold">Confirming your payment…</h1>
        <p className="text-sm text-fg-muted">
          Your card went through. We are waiting for the order to settle — this usually takes a
          couple of seconds.
        </p>
      </Card>
    );
  }

  return (
    <>
      <HoldTimer expiresAt={order.expiresAt} onExpire={refetchOrder} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {intent ? (
          <Elements
            // Remounting Elements on a new secret is the supported way to swap intents.
            key={intent.clientSecret}
            stripe={getStripe()}
            options={{ clientSecret: intent.clientSecret, appearance: stripeAppearance }}
          >
            <PaymentForm
              amountCents={order.totalCents}
              onConfirmed={() => {
                setIsAwaitingSaga(true);
                refetchOrder();
              }}
            />
          </Elements>
        ) : (
          <Skeleton className="h-80 rounded-card" />
        )}

        <OrderSummary order={order} />
      </div>
    </>
  );
}

function CheckoutSkeleton() {
  return (
    <>
      <Skeleton className="mb-6 h-21.5 rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-50 rounded-card" />
      </div>
    </>
  );
}
