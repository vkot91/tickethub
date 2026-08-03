import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { mockGateway, VENUE_ID } from '../test-gateway';
import { NewShowDialog } from './new-show-dialog';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'New show' }));
}

// The venue fixture (`../test-gateway`) seeds a single hall named "Grand Hall", not "Hall A".
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { title?: string; startsAt?: string } = {},
) {
  const { title = 'Neon Nights', startsAt = '2026-09-12T20:00' } = overrides;

  await user.type(screen.getByLabelText('Title'), title);
  await user.type(screen.getByLabelText('Starts at'), startsAt);

  // Radix Select is a listbox, not a native <select>.
  await user.click(await screen.findByRole('combobox', { name: 'Venue' }));
  await user.click(await screen.findByRole('option', { name: /Grand Hall/ }));
}

describe('NewShowDialog', () => {
  it('blocks submission and names the missing field when the form is empty', async () => {
    const fetchMock = mockGateway();

    const user = userEvent.setup();

    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await user.click(screen.getByRole('button', { name: 'New show' }));
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('Give the show a title')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/organizer/shows'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends the datetime-local value to the API as an ISO timestamp', async () => {
    const fetchMock = mockGateway();

    const user = userEvent.setup();

    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await user.click(screen.getByRole('button', { name: 'New show' }));
    await fillForm(user, { startsAt: '2026-09-01T19:30' });
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gateway/organizer/shows',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const [, submitInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/organizer/shows') &&
        (init as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit];

    const submittedBody = JSON.parse(String(submitInit.body)) as { startsAt: string };

    expect(submittedBody.startsAt).toBe(new Date('2026-09-01T19:30').toISOString());
  });

  it('offers the seeded venue catalogue', async () => {
    mockGateway();
    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await openDialog();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Venue' }));

    expect(await screen.findByRole('option', { name: /Grand Hall — Berlin/ })).toBeInTheDocument();
  });

  it('creates the draft and lands in its editor', async () => {
    const fetchMock = mockGateway();
    const user = userEvent.setup();

    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await openDialog();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gateway/organizer/shows',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(VENUE_ID),
        }),
      ),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/shows/11111111-1111-4111-8111-111111111111/edit'),
    );

    // Fired into the app's single Toaster, which `renderWithQuery` mounts as the layout does.
    expect(await screen.findByText('Draft created')).toBeInTheDocument();
  });

  it('renders a 409 as an inline title error, not a toast', async () => {
    mockGateway({
      '/organizer/shows': {
        status: 409,
        body: { message: 'A show with that title already exists' },
      },
    });
    const user = userEvent.setup();

    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await openDialog();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('You already have a show with this title.')).toBeInTheDocument();
    // The form stays open with the typed title, because that is where the fix is.
    expect(screen.getByLabelText('Title')).toHaveValue('Neon Nights');
  });
});
