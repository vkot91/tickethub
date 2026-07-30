'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button, Field, Input } from '@tickethub/ui';

import { registerOrganizerAction } from './actions';

/** Signup and the role flip in one screen — an organizer never has to visit the buyer site to
 *  get an account. Existing buyers go through `/become` instead, which skips the credentials. */
export function RegisterForm() {
  const [error, submit, isPending] = useActionState(registerOrganizerAction, null);

  return (
    <form action={submit} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">
        Start selling tickets
      </h1>

      <Field label="Display name" htmlFor="name">
        <Input id="name" name="name" autoComplete="organization" required />
        <p className="text-[13px] text-fg-muted">Shown to buyers on your show pages</p>
      </Field>

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" error={error ?? undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Setting you up…' : 'Create organizer account'}
      </Button>

      <p className="text-[13px] text-fg-muted">
        Already have one?{' '}
        <Link href="/login" className="text-fg underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
