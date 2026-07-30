'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button, Field, Input } from '@tickethub/ui';

import { signInAction } from './actions';

/** This app's cookies are its own, so being signed in on the buyer site does not sign you in
 *  here — and `/register` mints an organizer account without a detour through it. */
export function LoginForm({ next }: { next: string }) {
  const [error, submit, isPending] = useActionState(signInAction.bind(null, next), null);

  return (
    <form action={submit} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">
        Organizer sign in
      </h1>

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" error={error ?? undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Please wait…' : 'Sign in'}
      </Button>

      <p className="text-[13px] text-fg-muted">
        New here?{' '}
        <Link href="/register" className="text-fg underline underline-offset-2">
          Create an organizer account
        </Link>
      </p>
    </form>
  );
}
