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

async function fillForm() {
  await userEvent.type(screen.getByLabelText('Title'), 'Neon Nights');
  await userEvent.type(screen.getByLabelText('Starts at'), '2026-09-12T20:00');

  // Radix Select is a listbox, not a native <select>.
  await userEvent.click(await screen.findByRole('combobox', { name: 'Venue' }));
  await userEvent.click(await screen.findByRole('option', { name: /Grand Hall/ }));
}

describe('NewShowDialog', () => {
  it('keeps Create draft disabled until title, venue and start are all set', async () => {
    mockGateway();
    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await openDialog();

    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Title'), 'Neon Nights');
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled();

    await fillForm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled());
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
    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await openDialog();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

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
  });

  it('renders a 409 as an inline title error, not a toast', async () => {
    mockGateway({
      '/organizer/shows': {
        status: 409,
        body: { message: 'A show with that title already exists' },
      },
    });
    renderWithQuery(<NewShowDialog trigger={<button>New show</button>} />);

    await openDialog();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('You already have a show with this title.')).toBeInTheDocument();
    // The form stays open with the typed title, because that is where the fix is.
    expect(screen.getByLabelText('Title')).toHaveValue('Neon Nights');
  });
});
