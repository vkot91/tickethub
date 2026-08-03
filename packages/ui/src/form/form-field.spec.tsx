import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Form } from './form';
import { FormField } from './form-field';

const schema = z.object({
  title: z.string().min(1, 'Give it a title'),
  description: z.string(),
});

type Values = z.infer<typeof schema>;

function Harness({ onSubmit = vi.fn() }: { onSubmit?: (values: Values) => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { title: '', description: '' },
  });

  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormField name="title" label="Title" hint="Shown on the poster" />
      <FormField name="description" label="Description" as="textarea" rows={3} />
      <button type="submit">Save</button>
    </Form>
  );
}

describe('FormField', () => {
  it('associates its label with the input', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.type(screen.getByLabelText('Title'), 'Neon Night');

    expect(screen.getByLabelText('Title')).toHaveValue('Neon Night');
  });

  it('renders a textarea when asked for one', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
  });

  it('renders the hint', () => {
    render(<Harness />);

    expect(screen.getByText('Shown on the poster')).toBeInTheDocument();
  });

  it('shows the schema message and marks the input invalid once the field is touched', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByLabelText('Title'));
    await user.tab();

    expect(await screen.findByText('Give it a title')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Give it a title');
  });

  it('leaves a valid input unmarked', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Title')).not.toHaveAttribute('aria-invalid');
  });
});
