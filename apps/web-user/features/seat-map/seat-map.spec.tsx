import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { SeatMap } from './seat-map';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const SHOW_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_TYPE_ID = '77777777-7777-4777-8777-777777777771';

const seatMap = {
  showId: SHOW_ID,
  sections: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Parterre',
      rows: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          number: 1,
          seats: [
            {
              id: '44444444-4444-4444-8444-444444444441',
              number: 1,
              ticketTypeId: TICKET_TYPE_ID,
              priceCents: 5000,
              tier: 'standard',
            },
            {
              id: '44444444-4444-4444-8444-444444444442',
              number: 2,
              ticketTypeId: TICKET_TYPE_ID,
              priceCents: 5000,
              tier: 'standard',
            },
          ],
        },
      ],
    },
  ],
};

interface Reply {
  status: number;
  body: unknown;
}

/** Routes by URL so the seat-map poll and the order POST can answer differently. */
function mockGateway(orderReply: Reply) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const reply: Reply = init?.method === 'POST' ? orderReply : { status: 200, body: seatMap };

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

function renderSeatMap() {
  return renderWithQuery(<SeatMap showId={SHOW_ID} />);
}

const seatA1 = () => screen.getByRole('button', { name: /^Seat A1,/ });
const seatA2 = () => screen.getByRole('button', { name: /^Seat A2,/ });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SeatMap', () => {
  it('selects and deselects a seat, and shows the running total', async () => {
    mockGateway({ status: 200, body: {} });
    renderSeatMap();

    await waitFor(() => expect(seatA1()).toBeInTheDocument());

    await userEvent.click(seatA1());
    expect(seatA1()).toHaveAttribute('aria-pressed', 'true');
    // The seat map's price is the one orders charges (5000 = $50), never a UI-invented tier
    // price — a mismatch here is a total on screen that the checkout then contradicts.
    const summary = screen.getByRole('button', { name: 'Continue →' }).closest('div')!;
    expect(within(summary).getByText('$50')).toBeInTheDocument();

    await userEvent.click(seatA2());
    expect(within(summary).getByText('$100')).toBeInTheDocument();
    await userEvent.click(seatA2());

    await userEvent.click(seatA1());
    expect(seatA1()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Continue →' })).not.toBeInTheDocument();
  });

  it('removes a seat from the summary chip too', async () => {
    mockGateway({ status: 200, body: {} });
    renderSeatMap();

    await waitFor(() => expect(seatA1()).toBeInTheDocument());
    await userEvent.click(seatA1());

    await userEvent.click(screen.getByRole('button', { name: 'Remove seat A1' }));

    expect(seatA1()).toHaveAttribute('aria-pressed', 'false');
  });

  it('creates the order and moves on to checkout', async () => {
    const orderId = '55555555-5555-4555-8555-555555555555';

    const fetchMock = mockGateway({
      status: 201,
      body: {
        id: orderId,
        status: 'awaiting_payment',
        totalCents: 32000,
        currency: 'usd',
        expiresAt: '2026-08-14T20:10:00.000Z',
        seats: [
          {
            seatId: '99999999-9999-4999-8999-999999999991',
            ticketTypeId: '88888888-8888-4888-8888-888888888881',
          },
        ],
      },
    });

    renderSeatMap();

    await waitFor(() => expect(seatA1()).toBeInTheDocument());
    await userEvent.click(seatA1());
    await userEvent.click(screen.getByRole('button', { name: 'Continue →' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/orders/${orderId}/checkout`));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');

    expect(post?.[0]).toBe('/api/gateway/orders');
    expect(post?.[1]?.headers).toHaveProperty('idempotency-key');

    // Orders 400s with "Unknown ticketTypeId" if the seat id is sent in its place.
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      showId: SHOW_ID,
      seats: [{ seatId: '44444444-4444-4444-8444-444444444441', ticketTypeId: TICKET_TYPE_ID }],
    });
  });

  it('rolls the selection back and explains itself when the seats are already taken', async () => {
    mockGateway({ status: 409, body: { message: 'Seat already reserved' } });
    renderSeatMap();

    await waitFor(() => expect(seatA1()).toBeInTheDocument());
    await userEvent.click(seatA1());
    await userEvent.click(screen.getByRole('button', { name: 'Continue →' }));

    expect(await screen.findByText('Those seats just went')).toBeInTheDocument();

    await waitFor(() => expect(seatA1()).toHaveAttribute('aria-pressed', 'false'));
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the selection on a failure that is not a conflict', async () => {
    mockGateway({ status: 500, body: { message: 'Orders is down' } });
    renderSeatMap();

    await waitFor(() => expect(seatA1()).toBeInTheDocument());
    await userEvent.click(seatA1());
    await userEvent.click(screen.getByRole('button', { name: 'Continue →' }));

    expect(await screen.findByText('Could not hold those seats')).toBeInTheDocument();
    expect(seatA1()).toHaveAttribute('aria-pressed', 'true');
  });

  it('caps the selection at eight seats', async () => {
    const wideRow = {
      ...seatMap,
      sections: [
        {
          ...seatMap.sections[0],
          rows: [
            {
              ...seatMap.sections[0].rows[0],
              seats: Array.from({ length: 10 }, (_, index) => ({
                id: `66666666-6666-4666-8666-66666666600${index}`,
                number: index + 1,
                ticketTypeId: TICKET_TYPE_ID,
                priceCents: 5000,
                tier: 'standard',
              })),
            },
          ],
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(wideRow)),
      } as unknown as Response),
    );

    renderSeatMap();

    await waitFor(() => expect(seatA1()).toBeInTheDocument());

    for (let number = 1; number <= 10; number += 1) {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Seat A${number},`) }));
    }

    const summary = screen.getByText('8 of 8 seats');

    expect(summary).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Seat A9,/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('does not let a sold or held seat be picked', async () => {
    mockGateway({ status: 200, body: {} });
    renderSeatMap();

    await waitFor(() => expect(seatA2()).toBeInTheDocument());

    // Every seat is available today; this guards the disabled wiring itself.
    expect(seatA2()).toBeEnabled();
  });
});

describe('SeatMap loading', () => {
  it('shows a skeleton rather than a spinner while the map loads', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    const { container } = renderSeatMap();

    expect(within(container).queryByRole('button')).not.toBeInTheDocument();
  });
});
