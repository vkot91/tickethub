import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';

import { clientEnv } from './env/client';

let stripePromise: Promise<Stripe | null> | undefined;

export function getStripe(): Promise<Stripe | null> {
  // Loaded once per page, lazily — the script is only needed on checkout.
  stripePromise ??= loadStripe(clientEnv().NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  return stripePromise;
}

/**
 * Stripe renders its fields in a cross-origin iframe, so it cannot read our CSS variables.
 * These literals are the one place in the app that repeats token values — keep them in step
 * with `app/globals.css`.
 */
export const stripeAppearance: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#8b6dff',
    colorBackground: '#0e1016',
    colorText: '#f4f5f7',
    colorTextSecondary: '#9ba0ab',
    colorDanger: '#f87171',
    fontFamily: 'Instrument Sans, system-ui, sans-serif',
    borderRadius: '12px',
  },
};
