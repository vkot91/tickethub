import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthForm } from './auth-form';
import { authenticate } from './actions';

/** The action itself runs on the server; this suite covers what the form hands it and what it
 *  does with the message it gets back. `actions.spec.ts` covers the action. */
vi.mock('./actions', () => ({ authenticate: vi.fn().mockResolvedValue(null) }));

async function submit(email: string, password: string, button = 'Sign in') {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: button }));
}

function submittedFields() {
  const [, , , formData] = vi.mocked(authenticate).mock.calls[0];

  return { email: formData.get('email'), password: formData.get('password') };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthForm', () => {
  it('submits the credentials with the mode and destination bound on the server', async () => {
    render(<AuthForm mode="login" next="/tickets" />);

    await submit('buyer@example.com', 'hunter2hunter2');

    const [mode, next] = vi.mocked(authenticate).mock.calls[0];

    expect([mode, next]).toEqual(['login', '/tickets']);
    expect(submittedFields()).toEqual({
      email: 'buyer@example.com',
      password: 'hunter2hunter2',
    });
  });

  it('shows the message the action returns when the credentials are rejected', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce('Invalid credentials');
    render(<AuthForm mode="login" next="/" />);

    await submit('buyer@example.com', 'wrongpassword');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('renders the register variant with its own copy', async () => {
    render(<AuthForm mode="register" next="/" />);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();

    await submit('buyer@example.com', 'hunter2hunter2', 'Create account');

    expect(vi.mocked(authenticate).mock.calls[0][0]).toBe('register');
  });
});
