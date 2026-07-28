import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type OrderResponse } from '@tickethub/contracts';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { Checkout } from './checkout';

const ORDER_ID = '55555555-5555-4555-8555-555555555555';

const confirmPayment = vi.fn();

// Stripe's Elements run in a cross-origin iframe; stand them in with the smallest thing
// that still exercises our own submit path.
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
}));

vi.mock('@/lib/stripe', () => ({ getStripe: () => null, stripeAppearance: {} }));

function order(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: ORDER_ID,
    status: 'awaiting_payment',
    totalCents: 32000,
    currency: 'usd',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    seats: [
      {
        seatId: '99999999-9999-4999-8999-999999999991',
        ticketTypeId: '88888888-8888-4888-8888-888888888881',
      },
    ],
    ...overrides,
  };
}

/** Answers the order poll from a queue, so a test can watch the status move. */
function mockGateway(orders: OrderResponse[]) {
  let call = 0;

  const fetchMock = vi.fn((url: string) => {
    const body = url.includes('/payments/intent')
      ? {
          clientSecret: 'pi_secret_123',
          paymentIntentId: 'pi_123',
          amountCents: 32000,
          currency: 'usd',
        }
      : (orders[Math.min(call++, orders.length - 1)] as unknown);

    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function renderCheckout() {
  return renderWithQuery(<Checkout orderId={ORDER_ID} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Checkout', () => {
  it('shows the timer, the amount and the payment form for a payable order', async () => {
    mockGateway([order()]);
    renderCheckout();

    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
    expect(screen.getByRole('button', { name: 'Pay $320' })).toBeInTheDocument();
  });

  it('waits for the saga rather than trusting confirmPayment', async () => {
    confirmPayment.mockResolvedValue({});
    mockGateway([order()]);
    renderCheckout();

    await userEvent.click(await screen.findByRole('button', { name: 'Pay $320' }));

    expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument();
    // Crucially not "Payment confirmed" — only a paid order earns that.
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
  });

  it('lands on success once the order comes back paid', async () => {
    confirmPayment.mockResolvedValue({});
    mockGateway([order(), order({ status: 'paid' })]);
    renderCheckout();

    await userEvent.click(await screen.findByRole('button', { name: 'Pay $320' }));

    expect(await screen.findByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View my tickets →' })).toHaveAttribute(
      'href',
      '/tickets',
    );
  });

  it('reports a declined card and leaves the form usable', async () => {
    confirmPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } });
    mockGateway([order()]);
    renderCheckout();

    await userEvent.click(await screen.findByRole('button', { name: 'Pay $320' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined.');
    expect(screen.getByRole('button', { name: 'Pay $320' })).toBeEnabled();
    expect(screen.queryByText('Confirming your payment…')).not.toBeInTheDocument();
  });

  it.each([
    ['expired', 'Your seats were released'],
    ['cancelled', 'Order cancelled'],
    ['refunded', 'Order refunded'],
  ] as const)('shows the %s result instead of a payment form', async (status, title) => {
    mockGateway([order({ status })]);
    renderCheckout();

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
  });

  it('does not ask for a payment intent on an order that cannot be paid', async () => {
    const fetchMock = mockGateway([order({ status: 'expired' })]);
    renderCheckout();

    await screen.findByText('Your seats were released');

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/payments/intent'))).toBe(
        false,
      ),
    );
  });
});
