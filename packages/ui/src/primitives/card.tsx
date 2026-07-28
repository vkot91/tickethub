import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

const cardVariants = cva('border border-line bg-surface', {
  variants: {
    radius: { card: 'rounded-card', panel: 'rounded-panel', control: 'rounded-control' },
    padding: { none: '', sm: 'p-4', md: 'p-4.5', lg: 'p-6' },
    interactive: { true: 'cursor-pointer transition hover:border-white/20', false: '' },
  },
  defaultVariants: { radius: 'card', padding: 'md', interactive: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  /** Render the surface onto the child element — a `form` or `section`, most often. */
  asChild?: boolean;
}

export function Card({
  className,
  radius,
  padding,
  interactive,
  asChild = false,
  ...props
}: CardProps) {
  const Component = asChild ? Slot : 'div';

  return (
    <Component
      className={cn(cardVariants({ radius, padding, interactive }), className)}
      {...props}
    />
  );
}
