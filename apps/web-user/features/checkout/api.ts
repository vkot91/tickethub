import { type PaymentIntentResponse, paymentIntentResponseSchema } from '@tickethub/contracts';

import { clientApi } from '@tickethub/web-kit';

/** The intent is keyed by order id on the payments side, so asking twice is safe. */
export function createPaymentIntent(orderId: string): Promise<PaymentIntentResponse> {
  return clientApi(
    '/payments/intent',
    { method: 'POST', body: { orderId } },
    paymentIntentResponseSchema,
  );
}
