'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, FormError, FormField } from '@tickethub/ui';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import {
  registerOrganizerFormSchema,
  type RegisterOrganizerForm,
} from './register-organizer-schema';
import { registerOrganizerAction } from './actions';

/** Signup and the role flip in one screen — an organizer never has to visit the buyer site to
 *  get an account. Existing buyers go through `/become` instead, which skips the credentials. */
export function RegisterForm() {
  const form = useForm<RegisterOrganizerForm>({
    resolver: zodResolver(registerOrganizerFormSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', password: '' },
  });

  async function submit(details: RegisterOrganizerForm) {
    const failure = await registerOrganizerAction(details);

    if (failure) form.setError('root', { message: failure });
  }

  return (
    <Form form={form} onSubmit={(values) => submit(values)} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">
        Start selling tickets
      </h1>

      <FormField
        name="name"
        label="Display name"
        hint="Shown to buyers on your show pages"
        autoComplete="organization"
      />

      <FormField name="email" label="Email" type="email" autoComplete="email" />
      <FormField name="password" label="Password" type="password" autoComplete="new-password" />

      <FormError />

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Setting you up…' : 'Create organizer account'}
      </Button>

      <p className="text-[13px] text-fg-muted">
        Already have one?{' '}
        <Link href="/login" className="text-fg underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </Form>
  );
}
