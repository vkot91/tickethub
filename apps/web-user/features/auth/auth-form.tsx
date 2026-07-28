'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Button, Field, Input } from '@tickethub/ui';

import { authenticate } from './actions';

const copy = {
  login: {
    title: 'Welcome back',
    submit: 'Sign in',
    altPrompt: 'No account yet?',
    altLabel: 'Create one',
    altHref: '/register',
  },
  register: {
    title: 'Create your account',
    submit: 'Create account',
    altPrompt: 'Already have an account?',
    altLabel: 'Sign in',
    altHref: '/login',
  },
} as const;

export type AuthMode = keyof typeof copy;

export function AuthForm({ mode, next }: { mode: AuthMode; next: string }) {
  const text = copy[mode];

  const [error, submit, isPending] = useActionState(authenticate.bind(null, mode, next), null);

  return (
    <form action={submit} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">{text.title}</h1>

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" htmlFor="password" error={error ?? undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
        />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Please wait…' : text.submit}
      </Button>

      <p className="text-center text-[13px] text-fg-muted">
        {text.altPrompt}{' '}
        <Link href={text.altHref} className="text-accent hover:text-accent-hover">
          {text.altLabel}
        </Link>
      </p>
    </form>
  );
}
