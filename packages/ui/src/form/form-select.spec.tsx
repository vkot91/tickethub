import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Form } from './form';
import { FormSelect } from './form-select';

const schema = z.object({ venueId: z.string().min(1, 'Pick a hall') });

type Values = z.infer<typeof schema>;

const options = [
  { value: 'hall-a', label: 'Hall A' },
  { value: 'hall-b', label: 'Hall B' },
];

function Harness({ onSubmit = vi.fn() }: { onSubmit?: (values: Values) => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { venueId: '' },
  });

  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormSelect name="venueId" label="Venue" placeholder="Pick a hall" options={options} />
      <button type="submit">Save</button>
    </Form>
  );
}

describe('FormSelect', () => {
  it('writes the chosen option through to form state', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText('Venue'));
    await user.click(await screen.findByRole('option', { name: 'Hall B' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({ venueId: 'hall-b' }, expect.anything());
  });

  it('shows the placeholder until something is chosen', () => {
    render(<Harness />);

    expect(screen.getByText('Pick a hall')).toBeInTheDocument();
  });

  it('shows the schema message when submitted empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The placeholder and the schema's validation message are deliberately the same words
    // ("Pick a hall"), so a text query is ambiguous here — it would match both the Select's
    // placeholder and the error. Query by role to prove the message landed in Field's error
    // slot specifically, not merely that the text exists somewhere on the page.
    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Pick a hall');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
