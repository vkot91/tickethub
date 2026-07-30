import { type Metadata } from 'next';

import { Card } from '@tickethub/ui';

import { RegisterForm } from '@/features/auth/register-form';

export const metadata: Metadata = { title: 'Create an organizer account' };

export default function RegisterPage() {
  return (
    <Card radius="panel" padding="lg" className="mx-auto w-full max-w-105">
      <RegisterForm />
    </Card>
  );
}
