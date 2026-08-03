'use client';

import type { ReactNode } from 'react';
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form';

interface FormProps<
  TFieldValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues | undefined,
> {
  form: UseFormReturn<TFieldValues, TContext, TTransformed>;
  /** Derived from the form's own `handleSubmit`, so a transforming schema types through:
   *  the inputs hold raw strings, this receives the parsed output. */
  onSubmit: Parameters<UseFormReturn<TFieldValues, TContext, TTransformed>['handleSubmit']>[0];
  className?: string;
  children: ReactNode;
}

/** Owns the `FormProvider` so `FormField`/`FormSelect` can reach the form through context
 *  instead of every call site drilling `control` into each one. */
export function Form<
  TFieldValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues | undefined,
>({ form, onSubmit, className, children }: FormProps<TFieldValues, TContext, TTransformed>) {
  return (
    <FormProvider {...form}>
      {/* `noValidate`: the resolver's messages are the ones we render — native bubbles would
          fire first and say something else. */}
      <form onSubmit={form.handleSubmit(onSubmit)} className={className} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}
