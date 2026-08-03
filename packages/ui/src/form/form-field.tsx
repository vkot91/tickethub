'use client';

import { useFormContext } from 'react-hook-form';

import { Field } from '../composites/field';
import { Input } from '../primitives/input';
import { Textarea } from '../primitives/textarea';

type ControlProps = { as?: 'input'; type?: string } | { as: 'textarea'; rows?: number };

type FormFieldProps = {
  // ponytail: `name` is a plain string — RHF cannot infer the form's generic from a parent JSX
  // element, so a typo fails a test rather than the typechecker. If that ever bites, the upgrade
  // is a `createTypedForm<Schema>()` factory returning schema-bound components.
  name: string;
  label: string;
  hint?: string;
  autoComplete?: string;
  disabled?: boolean;
} & ControlProps;

export function FormField({
  name,
  label,
  hint,
  autoComplete,
  disabled,
  ...control
}: FormFieldProps) {
  const { register, formState } = useFormContext();

  const error = formState.errors[name]?.message;
  const message = typeof error === 'string' ? error : undefined;

  const registered = register(name);

  const bind = {
    id: name,
    autoComplete,
    'aria-invalid': message ? true : undefined,
    'aria-describedby': message ? `${name}-error` : undefined,
    ...registered,
    // After the spread: `register` only carries a `disabled` key when the *form* is disabled,
    // so a per-field lock has to be OR-ed in rather than left to be overwritten by `undefined`.
    disabled: registered.disabled || disabled,
  };

  return (
    <Field label={label} htmlFor={name} error={message}>
      {control.as === 'textarea' ? (
        <Textarea {...bind} rows={control.rows} />
      ) : (
        <Input {...bind} type={control.type} />
      )}

      {hint ? <p className="text-[13px] text-fg-muted">{hint}</p> : null}
    </Field>
  );
}
