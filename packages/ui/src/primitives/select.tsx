'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string | undefined;
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
  /** Forwarded to the trigger so a `<Label htmlFor>` can point at it. */
  id?: string;
  className?: string;
  onValueChange: (value: string) => void;
}

/** Radix Select — keyboard navigation, typeahead and the listbox roles come for free. */
export function Select({
  value,
  options,
  placeholder,
  ariaLabel,
  id,
  className,
  onValueChange,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 text-[13px] text-fg-secondary hover:border-white/20',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden className="size-3.5" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-100 overflow-hidden rounded-control border border-line bg-surface p-1"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-fg-secondary outline-none data-[highlighted]:bg-accent/20 data-[highlighted]:text-fg"
              >
                <SelectPrimitive.ItemIndicator>
                  <Check aria-hidden className="size-3.5 text-accent" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
