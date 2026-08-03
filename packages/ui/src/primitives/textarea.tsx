import type { Ref, TextareaHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * Not Radix-backed, and deliberately so: Radix Primitives ships no textarea. Its own Form docs
 * say "Radix does not ship its own TextField or Textarea components. Instead, `Form.Control`
 * wraps native inputs" — a styled native element mirroring `Input` *is* the prescribed shape.
 * Every control Radix does ship a primitive for (Select, Checkbox, Switch, …) must use it.
 */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'w-full rounded-control border border-line bg-deep px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint focus-visible:border-accent focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}
