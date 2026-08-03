import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { isSettled, ORDER_PAGE_SIZE, orderKeys, ordersPath, type OrderListItem } from './api';
import { OrderList } from './order-list';

function makeOrder(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    status: 'paid',
    totalCents: 32000,
    currency: 'usd',
    expiresAt: '2026-08-14T20:10:00.000Z',
    showId: '11111111-1111-4111-8111-111111111111',
    showTitle: 'Demo Concert',
    seatLabels: ['A1', 'A2'],
    seats: [
      {
        seatId: '99999999-9999-4999-8999-999999999991',
        ticketTypeId: '88888888-8888-4888-8888-888888888881',
      },
      {
        seatId: '99999999-9999-4999-8999-999999999992',
        ticketTypeId: '88888888-8888-4888-8888-888888888881',
      },
    ],
    createdAt: '2026-08-01T18:00:00.000Z',
    ...overrides,
  };
}

/** Replies per URL so the list fetch and the refund POST can differ. */
function mockGateway(pages: unknown[], refund?: { status: number; body: unknown }) {
  let page = 0;

  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const reply =
      init?.method === 'POST'
        ? (refund ?? { status: 200, body: makeOrder({ status: 'refunded' }) })
        : { status: 200, body: pages[Math.min(page++, pages.length - 1)] };

    return Promise.resolve({
      ok: reply.status < 400,
      status: reply.status,
      statusText: 'Error',
      text: () => Promise.resolve(JSON.stringify(reply.body)),
    } as unknown as Response);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function renderOrders() {
  return renderWithQuery(<OrderList />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('orders api', () => {
  it('asks for a page, with and without a cursor', () => {
    expect(ordersPath()).toBe(`/orders?limit=${ORDER_PAGE_SIZE}`);
    expect(ordersPath('abc')).toBe(`/orders?limit=${ORDER_PAGE_SIZE}&cursor=abc`);
  });

  it('namespaces list and detail under the same feature key', () => {
    expect(orderKeys.list()).toEqual(['order', 'list']);
    expect(orderKeys.byId('x')).toEqual(['order', 'x']);
  });

  it('knows which statuses the saga has finished with', () => {
    expect(isSettled('awaiting_payment')).toBe(false);
    expect((['paid', 'expired', 'cancelled', 'refunded'] as const).every(isSettled)).toBe(true);
  });
});

describe('OrderList', () => {
  it('lists an order with its seats and total', async () => {
    mockGateway([{ items: [makeOrder()], nextCursor: null }]);
    renderOrders();

    expect(await screen.findByRole('heading', { name: 'Demo Concert' })).toBeInTheDocument();
    expect(screen.getByText('$320')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('offers a way to pay an order that is still awaiting payment', async () => {
    mockGateway([{ items: [makeOrder({ status: 'awaiting_payment' })], nextCursor: null }]);
    renderOrders();

    expect(await screen.findByRole('link', { name: 'Pay now →' })).toHaveAttribute(
      'href',
      '/orders/55555555-5555-4555-8555-555555555555/checkout',
    );
    expect(screen.queryByRole('button', { name: 'Request refund' })).not.toBeInTheDocument();
  });

  it('points nowhere-to-go users at the catalog', async () => {
    mockGateway([{ items: [], nextCursor: null }]);
    renderOrders();

    expect(await screen.findByText('You have not booked anything yet.')).toBeInTheDocument();
  });

  it('appends the next page', async () => {
    const second = makeOrder({
      id: '66666666-6666-4666-8666-666666666666',
      showTitle: 'Night Two',
    });

    mockGateway([
      { items: [makeOrder()], nextCursor: second.id },
      { items: [second], nextCursor: null },
    ]);
    renderOrders();

    await screen.findByRole('heading', { name: 'Demo Concert' });
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Night Two' })).toBeInTheDocument();
  });
});

describe('RefundButton', () => {
  it('asks before refunding, and does nothing if the user backs out', async () => {
    const fetchMock = mockGateway([{ items: [makeOrder()], nextCursor: null }]);
    renderOrders();

    await userEvent.click(await screen.findByRole('button', { name: 'Request refund' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Refund this order?');

    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('posts the refund once confirmed and says it is on its way', async () => {
    const fetchMock = mockGateway([{ items: [makeOrder()], nextCursor: null }]);
    renderOrders();

    await userEvent.click(await screen.findByRole('button', { name: 'Request refund' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Refund' }));

    expect(
      await screen.findByText('Refund requested — this can take a few days.'),
    ).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');

    expect(post?.[0]).toBe('/api/gateway/orders/55555555-5555-4555-8555-555555555555/refund');
  });

  it('surfaces a refund the backend refused', async () => {
    mockGateway([{ items: [makeOrder()], nextCursor: null }], {
      status: 409,
      body: { message: 'Order already refunded' },
    });
    renderOrders();

    await userEvent.click(await screen.findByRole('button', { name: 'Request refund' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Refund' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Order already refunded');
  });
});
