import type { CreatePaymentIntentDto, PaymentIntentResponse } from './schema';
import type { Rpc } from '../shape';

export const PAYMENTS_MESSAGE_PATTERNS = {
  CREATE_INTENT: 'payments.createIntent',
  WEBHOOK: 'payments.webhook',
} as const;

export const PAYMENT_ROUTING_KEYS = {
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_SUCCEEDED: 'refund.succeeded',
} as const;

export interface PaymentsRpcContracts {
  [PAYMENTS_MESSAGE_PATTERNS.CREATE_INTENT]: Rpc<{
    payload: { userId: string; dto: CreatePaymentIntentDto };
    result: PaymentIntentResponse;
  }>;
  // The raw body, not a parsed one — Stripe's signature is over the bytes the edge received.
  [PAYMENTS_MESSAGE_PATTERNS.WEBHOOK]: Rpc<{
    payload: { rawBody: string; signature: string };
    result: { received: boolean };
  }>;
}
