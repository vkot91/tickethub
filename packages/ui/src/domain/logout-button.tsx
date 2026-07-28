'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '../primitives/button';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });

    startTransition(() => {
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={logout} disabled={isPending}>
      Sign out
    </Button>
  );
}
