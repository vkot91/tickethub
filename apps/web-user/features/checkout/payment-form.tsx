'use client';

import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useState } from 'react';

import { Button, Card, formatPrice } from '@tickethub/ui';

interface PaymentFormProps {
  amountCents: number;
  onConfirmed: () => void;
}

/**
 * Collects the card and confirms the intent. It deliberately does not treat a successful
 * `confirmPayment` as a paid order — the webhook and the saga decide that, and the caller
 * polls the order until it says so.
 */
export function PaymentForm({ amountCents, onConfirmed }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function pay(formEvent: React.FormEvent) {
    formEvent.preventDefault();

    if (!stripe || !elements) return;

    setError(null);
    setIsSubmitting(true);

    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error.message ?? 'Your payment could not be confirmed.');

      return;
    }

    onConfirmed();
  }

  return (
    <Card padding="lg" asChild>
      <form onSubmit={pay} noValidate>
        <h2 className="mb-5 font-display text-lg font-semibold">Payment</h2>

        <PaymentElement />

        {error ? (
          <p role="alert" className="mt-4 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={!stripe || isSubmitting} className="mt-6 w-full">
          {isSubmitting ? 'Confirming…' : `Pay ${formatPrice(amountCents)}`}
        </Button>
      </form>
    </Card>
  );
}
