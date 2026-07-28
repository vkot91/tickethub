import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { type CheckInResult } from '../api';
import { Scanner } from './scanner';

function result(overrides: Partial<CheckInResult> = {}): CheckInResult {
  return {
    result: 'valid',
    seatLabel: 'A1',
    showTitle: 'Demo Concert',
    checkedInAt: null,
    checkedInCount: 247,
    capacity: 400,
    ...overrides,
  };
}

/** Answers each check-in from a queue, so a repeat scan can come back "used". */
function mockCheckIn(replies: { status: number; body: unknown }[]) {
  let call = 0;

  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
    const reply = replies[Math.min(call++, replies.length - 1)];

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

function renderScanner() {
  return renderWithQuery(<Scanner />);
}

async function checkInCode(code: string) {
  await userEvent.type(screen.getByLabelText('Ticket code'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Scanner', () => {
  it('checks a ticket in and shows the seat', async () => {
    const fetchMock = mockCheckIn([{ status: 200, body: result() }]);
    renderScanner();

    await checkInCode('TH-A1-1042');

    const panel = await screen.findByRole('status');

    expect(within(panel).getByText('Checked in')).toBeInTheDocument();
    expect(within(panel).getByText('Demo Concert · seat A1')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('/api/gateway/tickets/check-in');
    expect(JSON.parse(init?.body as string)).toEqual({ code: 'TH-A1-1042' });
  });

  it('reports a ticket that was already used, with when', async () => {
    mockCheckIn([
      { status: 200, body: result({ result: 'used', checkedInAt: '2026-08-14T19:12:00.000Z' }) },
    ]);
    renderScanner();

    await checkInCode('TH-A1-1042');

    expect(await screen.findByText('Already used')).toBeInTheDocument();
    expect(screen.getByText('Scanned at 19:12')).toBeInTheDocument();
  });

  it('rejects an unknown code', async () => {
    mockCheckIn([
      { status: 200, body: result({ result: 'invalid', seatLabel: null, showTitle: null }) },
    ]);
    renderScanner();

    await checkInCode('nonsense');

    expect(await screen.findByText('Invalid ticket')).toBeInTheDocument();
  });

  it('tracks the gate count against capacity', async () => {
    mockCheckIn([{ status: 200, body: result() }]);
    renderScanner();

    await checkInCode('TH-A1-1042');

    expect(await screen.findByText('247 / 400')).toBeInTheDocument();
  });

  it('keeps a log of recent scans', async () => {
    mockCheckIn([
      { status: 200, body: result() },
      { status: 200, body: result({ result: 'used' }) },
    ]);
    renderScanner();

    await checkInCode('TH-A1-1042');
    await userEvent.clear(screen.getByLabelText('Ticket code'));
    await checkInCode('TH-A1-1042');

    expect(await screen.findByText('used')).toBeInTheDocument();
    expect(screen.getByText('valid')).toBeInTheDocument();
  });

  it('surfaces a failed check-in call', async () => {
    mockCheckIn([{ status: 500, body: { message: 'Fulfillment is down' } }]);
    renderScanner();

    await checkInCode('TH-A1-1042');

    expect(await screen.findByRole('alert')).toHaveTextContent('Fulfillment is down');
  });

  it('says so when the browser cannot scan, leaving manual entry usable', async () => {
    mockCheckIn([{ status: 200, body: result() }]);
    renderScanner();

    await userEvent.click(screen.getByRole('button', { name: 'Start camera' }));

    // jsdom has no BarcodeDetector, which is exactly the unsupported-browser path.
    expect(
      await screen.findByText('This browser cannot scan — type the code instead'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ticket code')).toBeEnabled();
  });
});
