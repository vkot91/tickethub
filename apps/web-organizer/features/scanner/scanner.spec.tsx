import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { draftShow, publishedShow, SHOW_ID } from '../test-gateway';
import { type CheckInResult } from './api';
import { Scanner } from './scanner';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function result(overrides: Partial<CheckInResult> = {}): CheckInResult {
  return {
    result: 'valid',
    seatLabel: 'A1',
    checkedInAt: null,
    checkedInCount: 247,
    ...overrides,
  };
}

/** Answers each check-in from a queue, so a repeat scan can come back "used". The show list the
 *  picker reads comes off the same stub — the screen talks to two endpoints. */
function mockCheckIn(replies: { status: number; body: unknown }[], shows = [publishedShow]) {
  let call = 0;

  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    const reply = String(url).includes('/organizer/shows')
      ? { status: 200, body: shows }
      : replies[Math.min(call++, replies.length - 1)];

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
  return renderWithQuery(<Scanner showId={SHOW_ID} />);
}

async function checkInCode(code: string) {
  await userEvent.type(screen.getByLabelText('Ticket code'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Scanner — the show picker', () => {
  it('offers a picker instead of a dead end when no show is chosen', async () => {
    mockCheckIn([]);
    renderWithQuery(<Scanner />);

    expect(await screen.findByRole('combobox', { name: 'Show' })).toBeInTheDocument();
    expect(screen.getByText('Pick a show to start scanning')).toBeInTheDocument();
  });

  // A camera prompt on a screen that cannot yet check anything in is how people click Deny.
  it('cannot start the camera before a show is chosen', async () => {
    mockCheckIn([]);
    renderWithQuery(<Scanner />);

    await screen.findByRole('combobox', { name: 'Show' });

    expect(screen.getByRole('button', { name: 'Start camera' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check in' })).toBeDisabled();
  });

  it('asks only for published shows — a draft has no tickets and a cancelled show has no gate', async () => {
    const fetchMock = mockCheckIn([]);
    renderWithQuery(<Scanner />);

    await screen.findByRole('combobox', { name: 'Show' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/gateway/organizer/shows?status=published');
  });

  it('scans against the show that was picked, and keeps it in the URL', async () => {
    const fetchMock = mockCheckIn([{ status: 200, body: result() }], [publishedShow, draftShow]);
    renderWithQuery(<Scanner />);

    await userEvent.click(await screen.findByRole('combobox', { name: 'Show' }));

    // The list is what the gateway answered; nothing is filtered a second time client-side.
    await userEvent.click(await screen.findByRole('option', { name: 'Demo Concert' }));

    expect(replace).toHaveBeenCalledWith(`/scanner?showId=${SHOW_ID}`, { scroll: false });

    await checkInCode('TH-A1-1042');

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());

    const [, init] = fetchMock.mock.calls.at(-1)!;

    expect(JSON.parse(init?.body as string)).toEqual({ code: 'TH-A1-1042', showId: SHOW_ID });
  });

  it('seeds the selection from `?showId=`', async () => {
    mockCheckIn([]);
    renderScanner();

    // The title only appears once the options land — the URL carries an id, not a name.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Show' })).toHaveTextContent('Demo Concert'),
    );
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeEnabled();
  });
});

describe('Scanner', () => {
  it('checks a ticket in and shows the seat', async () => {
    const fetchMock = mockCheckIn([{ status: 200, body: result() }]);
    renderScanner();

    await checkInCode('TH-A1-1042');

    const panel = await screen.findByRole('status');

    expect(within(panel).getByText('Checked in')).toBeInTheDocument();
    // The seat alone: the picker above already names the show, and the scan response no longer
    // carries it.
    expect(within(panel).getByText('Seat A1')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls.at(-1)!;

    expect(url).toBe('/api/gateway/organizer/check-in');
    expect(JSON.parse(init?.body as string)).toEqual({ code: 'TH-A1-1042', showId: SHOW_ID });
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
    mockCheckIn([{ status: 200, body: result({ result: 'invalid', seatLabel: null }) }]);
    renderScanner();

    await checkInCode('nonsense');

    expect(await screen.findByText('Invalid ticket')).toBeInTheDocument();
  });

  // A genuine ticket at the wrong door reads as a warning, not a forgery — the holder needs
  // directions, not security.
  it('tells the attendant a real ticket is for another show', async () => {
    mockCheckIn([{ status: 200, body: result({ result: 'wrongShow', seatLabel: null }) }]);
    renderScanner();

    await checkInCode('TH-B7-2291');

    expect(await screen.findByText('Wrong show')).toBeInTheDocument();
    expect(screen.queryByText('Invalid ticket')).not.toBeInTheDocument();
  });

  // The count comes back with the scan; the denominator comes off the picked show's row, which
  // the picker has already loaded. The response carries no capacity at all.
  it('tracks the gate count against the picked show’s capacity', async () => {
    mockCheckIn([{ status: 200, body: result() }]);
    renderScanner();

    await checkInCode('TH-A1-1042');

    expect(await screen.findByText(`247 / ${publishedShow.capacity}`)).toBeInTheDocument();
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
