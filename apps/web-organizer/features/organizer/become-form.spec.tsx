import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BecomeForm } from './become-form';
import { becomeOrganizerAction } from './actions';

vi.mock('./actions', () => ({ becomeOrganizerAction: vi.fn().mockResolvedValue(undefined) }));

const refresh = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

afterEach(() => {
  vi.clearAllMocks();
});

function submitButton() {
  return screen.getByRole('button', { name: /become an organizer|setting you up/i });
}

describe('BecomeForm', () => {
  it('prefills the display name with the account email', () => {
    render(<BecomeForm email="promoter@example.com" />);

    expect(screen.getByLabelText('Display name')).toHaveValue('promoter@example.com');
  });

  it('keeps submit disabled while the name is empty', async () => {
    const user = userEvent.setup();

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));

    expect(submitButton()).toBeDisabled();
  });

  it('keeps submit disabled for a whitespace-only name', async () => {
    const user = userEvent.setup();

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), '   ');

    expect(submitButton()).toBeDisabled();
  });

  // The new role lives in the cookies the action just wrote, and `middleware.ts` reads the
  // cookie. Push first and the middleware races the stale one and bounces back to /become.
  it('refreshes the session before navigating to the shows list', async () => {
    const user = userEvent.setup();
    const order: string[] = [];

    refresh.mockImplementation(() => order.push('refresh'));
    push.mockImplementation(() => order.push('push'));

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Neon Promotions');
    await user.click(submitButton());

    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(becomeOrganizerAction).toHaveBeenCalledWith('Neon Promotions');
    expect(order).toEqual(['refresh', 'push']);
    expect(push).toHaveBeenCalledWith('/shows?welcome=1');
  });

  it('shows an error and keeps the typed name when the action fails', async () => {
    const user = userEvent.setup();

    vi.mocked(becomeOrganizerAction).mockRejectedValueOnce(new Error('gateway down'));

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Neon Promotions');
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't set that up. Try again.");
    expect(screen.getByLabelText('Display name')).toHaveValue('Neon Promotions');
    expect(push).not.toHaveBeenCalled();
  });
});
