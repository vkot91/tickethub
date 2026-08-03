import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { becomeOrganizerAction } from './actions';
import { BecomeForm } from './become-form';

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

  it('enables submit on mount with the prefilled name, before any interaction', () => {
    render(<BecomeForm email="promoter@example.com" />);

    // Synchronous, no `waitFor`: the pre-touch validity comes from a synchronous schema parse
    // (see `become-form.tsx`), not from an async `trigger()` call, so there is nothing to await.
    expect(submitButton()).not.toBeDisabled();
  });

  // Regression coverage for a fix-round-1 defect: an earlier version validated the prefilled
  // value with a mount-time `form.trigger()`, which is async and could race with a real
  // interaction landing before it settled — whichever validation resolved last won, so clearing
  // the field immediately after mount (no wait in between) could leave the button stuck enabled.
  // These two cases interact with zero delay and no preceding `waitFor`, deliberately hitting
  // that exact window; they only pass reliably because the current fix has no async step for
  // anything to race against before the field is touched.
  it('keeps submit disabled while the name is empty, even when cleared immediately on mount', async () => {
    const user = userEvent.setup({ delay: null });

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));

    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it('keeps submit disabled for a whitespace-only name entered immediately on mount', async () => {
    const user = userEvent.setup({ delay: null });

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), '   ');

    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  // React StrictMode double-invokes effects in dev (`reactStrictMode: true` in
  // `apps/web-organizer/next.config.ts`). An earlier fix's mount-time `form.trigger()` would fire
  // twice concurrently under this, and — combined with the race above — could settle on the
  // wrong result. The synchronous parse this component uses now has no effect to double-invoke.
  it('settles to the correct valid state under StrictMode double-invoked effects', () => {
    render(
      <StrictMode>
        <BecomeForm email="promoter@example.com" />
      </StrictMode>,
    );

    expect(submitButton()).not.toBeDisabled();
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

  it('hands the action a trimmed name', async () => {
    const user = userEvent.setup();

    render(<BecomeForm email="promoter@example.com" />);

    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), '  Neon Promotions  ');
    await user.click(submitButton());

    await waitFor(() => expect(becomeOrganizerAction).toHaveBeenCalledWith('Neon Promotions'));
  });
});
