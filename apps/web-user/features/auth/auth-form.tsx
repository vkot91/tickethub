'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginDto } from '@tickethub/contracts';
import { Button, Form, FormError, FormField } from '@tickethub/ui';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

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

  const form = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  // The action redirects on success, so it only ever returns on failure.
  async function submit(credentials: LoginDto) {
    const failure = await authenticate(mode, next, credentials);

    if (failure) form.setError('root', { message: failure });
  }

  return (
    <Form form={form} onSubmit={(values) => submit(values)} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">{text.title}</h1>

      <FormField name="email" label="Email" type="email" autoComplete="email" />

      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
      />

      <FormError />

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Please wait…' : text.submit}
      </Button>

      <p className="text-center text-[13px] text-fg-muted">
        {text.altPrompt}{' '}
        <Link href={text.altHref} className="text-accent hover:text-accent-hover">
          {text.altLabel}
        </Link>
      </p>
    </Form>
  );
}
