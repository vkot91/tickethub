import type { PAYMENTS_MESSAGE_PATTERNS } from '../events';
import type { CreatePaymentIntentDto, PaymentIntentResponse } from '../payments';
import type { Rpc } from './shape';

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
