import type { InputHTMLAttributes, Ref } from 'react';

import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-control border border-line bg-deep px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint focus-visible:border-accent focus-visible:outline-none aria-invalid:border-danger aria-invalid:focus-visible:border-danger',
        className,
      )}
      {...props}
    />
  );
}
