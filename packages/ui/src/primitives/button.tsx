import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, Ref } from 'react';

import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 font-semibold whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary:
          'rounded-control bg-accent text-white shadow-[0_8px_28px_color-mix(in_oklab,var(--color-accent)_40%,transparent)] hover:bg-accent-hover',
        secondary:
          'rounded-control border border-line bg-surface text-fg-secondary hover:border-white/20 hover:text-fg',
        ghost: 'rounded-control text-fg-muted hover:text-fg',
        link: 'text-accent hover:text-accent-hover',
        danger:
          'rounded-control border border-danger/40 bg-danger/5 text-danger hover:border-danger hover:bg-danger/10 hover:text-danger-hover',
      },
      size: {
        xs: 'px-2 py-1 text-[11px]',
        sm: 'px-3 py-2 text-[13px]',
        md: 'px-5.5 py-3 text-sm',
        lg: 'px-6.5 py-3.5 text-[15px]',
        none: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the styling onto the child element — a `next/link`, most often. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
