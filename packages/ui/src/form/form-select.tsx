'use client';

import { Controller, useFormContext } from 'react-hook-form';

import { Field } from '../composites/field';
import { cn } from '../lib/cn';
import { Select, type SelectOption } from '../primitives/select';

interface FormSelectProps {
  name: string;
  label: string;
  placeholder: string;
  options: SelectOption[];
  className?: string;
}

/** Radix `Select` is controlled through `value`/`onValueChange` and has no input to bind, so it
 *  needs a `Controller` — this keeps that out of every call site. */
export function FormSelect({ name, label, placeholder, options, className }: FormSelectProps) {
  const { control, formState } = useFormContext();

  const error = formState.errors[name]?.message;
  const message = typeof error === 'string' ? error : undefined;

  return (
    <Field label={label} htmlFor={name} error={message}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            id={name}
            value={field.value}
            onValueChange={field.onChange}
            ariaLabel={label}
            placeholder={placeholder}
            options={options}
            className={cn(
              'w-full justify-between rounded-control border-line bg-deep px-3.5 py-2.5 text-sm',
              className,
            )}
          />
        )}
      />
    </Field>
  );
}
