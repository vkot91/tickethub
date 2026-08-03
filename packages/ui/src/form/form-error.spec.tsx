import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { FormError } from './form-error';

function Harness({ message }: { message?: string }) {
  const form = useForm();

  useEffect(() => {
    if (message) form.setError('root', { message });
  }, [message, form]);

  return (
    <FormProvider {...form}>
      <FormError />
    </FormProvider>
  );
}

describe('FormError', () => {
  it('renders the root error as an alert', () => {
    render(<Harness message="Invalid credentials" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('renders nothing when there is no root error', () => {
    render(<Harness />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
