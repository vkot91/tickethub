'use client';

import { useFormContext } from 'react-hook-form';

import { cn } from '../lib/cn';

/** Failures that belong to the submit rather than to a field — rejected credentials, a gateway
 *  that was down. Set with `form.setError('root', { message })`; RHF clears it on next submit. */
export function FormError({ className }: { className?: string }) {
  const { formState } = useFormContext();

  const message = formState.errors.root?.message;

  if (typeof message !== 'string' || message === '') return null;

  return (
    <p
      role="alert"
      className={cn(
        'rounded-control border border-danger/40 p-3 text-[13px] text-danger',
        className,
      )}
    >
      {message}
    </p>
  );
}
