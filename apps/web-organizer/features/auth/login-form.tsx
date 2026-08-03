'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { loginSchema, type LoginDto } from '@tickethub/contracts';
import { Button, Form, FormError, FormField } from '@tickethub/ui';

import { signInAction } from './actions';

/** This app's cookies are its own, so being signed in on the buyer site does not sign you in
 *  here — and `/register` mints an organizer account without a detour through it. */
export function LoginForm({ next }: { next: string }) {
  const form = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  async function submit(credentials: LoginDto) {
    const failure = await signInAction(next, credentials);

    if (failure) form.setError('root', { message: failure });
  }

  return (
    <Form form={form} onSubmit={(values) => submit(values)} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">
        Organizer sign in
      </h1>

      <FormField name="email" label="Email" type="email" autoComplete="email" />
      <FormField name="password" label="Password" type="password" autoComplete="current-password" />

      <FormError />

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Please wait…' : 'Sign in'}
      </Button>

      <p className="text-[13px] text-fg-muted">
        New here?{' '}
        <Link href="/register" className="text-fg underline underline-offset-2">
          Create an organizer account
        </Link>
      </p>
    </Form>
  );
}
