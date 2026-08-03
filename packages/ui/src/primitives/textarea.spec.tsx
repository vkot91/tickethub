import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders a textarea carrying the forwarded attributes', () => {
    render(<Textarea aria-label="Description" rows={3} defaultValue="A night of noise" />);

    const textarea = screen.getByLabelText('Description');

    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '3');
    expect(textarea).toHaveValue('A night of noise');
  });

  it('appends the caller className to the base styles', () => {
    render(<Textarea aria-label="Notes" className="mt-4" />);

    const textarea = screen.getByLabelText('Notes');

    expect(textarea).toHaveClass('mt-4');
    expect(textarea).toHaveClass('rounded-control');
  });
});
