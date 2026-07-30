import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WelcomeToast } from './welcome-toast';

describe('WelcomeToast', () => {
  it('announces that the account is now an organizer', () => {
    render(<WelcomeToast />);

    expect(screen.getByText("You're an organizer")).toBeInTheDocument();
    expect(screen.getByText('Start by creating a show.')).toBeInTheDocument();
  });
});
