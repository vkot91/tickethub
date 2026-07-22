import Stripe from 'stripe';

export class StripeClient {
  // Injected as a value provider so tests can pass a fake Stripe instance.
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
  ) {}

  static fromSecret(secretKey: string, webhookSecret: string): StripeClient {
    return new StripeClient(new Stripe(secretKey), webhookSecret);
  }

  async createPaymentIntent(
    idempotencyKey: string,
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<{ id: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create(
      { amount: amountCents, currency, metadata, automatic_payment_methods: { enabled: true } },
      { idempotencyKey },
    );
    return { id: intent.id, clientSecret: intent.client_secret ?? '' };
  }

  // Called when a seat reservation expires unpaid: kill the intent so the customer can't be
  // charged for a seat they no longer hold. Throws if Stripe already moved it out of a
  // cancelable state — the caller decides whether that race is expected.
  async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  async createRefund(idempotencyKey: string, paymentIntentId: string): Promise<{ id: string }> {
    const refund = await this.stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey },
    );
    return { id: refund.id };
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
