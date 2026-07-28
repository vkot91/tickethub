import { type Metadata } from 'next';

import { AuthForm } from '@/features/auth/auth-form';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return <AuthForm mode="register" next={next ?? '/'} />;
}
