import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Form } from './form';

const schema = z
  .object({ title: z.string().min(1, 'Give it a title') })
  .transform((values) => ({ title: values.title.toUpperCase() }));

function Harness({
  onSubmit,
  defaultTitle,
}: {
  onSubmit: (values: { title: string }) => void;
  defaultTitle: string;
}) {
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: defaultTitle },
  });

  return (
    <Form form={form} onSubmit={onSubmit}>
      <input aria-label="Title" {...form.register('title')} />
      <button type="submit">Save</button>
    </Form>
  );
}

describe('Form', () => {
  it('calls onSubmit with the schema-transformed values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} defaultTitle="neon night" />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ title: 'NEON NIGHT' });
  });

  it('does not call onSubmit when the schema rejects the values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} defaultTitle="" />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('suppresses native browser validation so Zod messages are what the user sees', () => {
    render(<Harness onSubmit={vi.fn()} defaultTitle="neon night" />);

    expect(document.querySelector('form')).toHaveAttribute('novalidate');
  });
});
