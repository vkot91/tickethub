import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerOrganizerAction } from './actions';
import { RegisterForm } from './register-form';

vi.mock('./actions', () => ({ registerOrganizerAction: vi.fn().mockResolvedValue(null) }));

afterEach(() => {
  vi.clearAllMocks();
});

async function fill(name: string, email: string, password: string) {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Display name'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(
    screen.getByRole('button', { name: /create organizer account|setting you up/i }),
  );
}

describe('RegisterForm', () => {
  it('hands the action the credentials and a trimmed display name', async () => {
    render(<RegisterForm />);

    await fill('  Neon Promotions  ', 'promoter@example.com', 'hunter2hunter2');

    expect(registerOrganizerAction).toHaveBeenCalledWith({
      name: 'Neon Promotions',
      email: 'promoter@example.com',
      password: 'hunter2hunter2',
    });
  });

  it('does not call the action when the display name is blank', async () => {
    render(<RegisterForm />);

    await fill('   ', 'promoter@example.com', 'hunter2hunter2');

    expect(registerOrganizerAction).not.toHaveBeenCalled();
    expect(await screen.findByText('Give yourself a display name')).toBeInTheDocument();
  });

  it('shows the partial-failure message the action returns', async () => {
    vi.mocked(registerOrganizerAction).mockResolvedValueOnce(
      'Your account is ready, but we could not set up the organizer profile. Open “Become an organizer” to finish.',
    );

    render(<RegisterForm />);

    await fill('Neon Promotions', 'promoter@example.com', 'hunter2hunter2');

    expect(await screen.findByRole('alert')).toHaveTextContent('Your account is ready');
  });
});
