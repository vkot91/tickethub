import { type Metadata } from 'next';

import { Card } from '@tickethub/ui';

import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card radius="panel" padding="lg" className="mx-auto w-full max-w-105">
      <LoginForm next={next ?? '/'} />
    </Card>
  );
}
