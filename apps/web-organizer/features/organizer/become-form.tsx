'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Button, Field, Input } from '@tickethub/ui';

import { becomeOrganizerAction } from './actions';

/** The email is prefilled from the server component rather than fetched again on the client —
 *  the session is already decoded one hop earlier. */
export function BecomeForm({ email }: { email: string }) {
  const router = useRouter();

  const [name, setName] = useState(email);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    setIsSubmitting(true);
    setHasFailed(false);

    try {
      await becomeOrganizerAction(name.trim());
    } catch {
      setHasFailed(true);
      setIsSubmitting(false);

      return;
    }

    // The new role lives in the cookies the action just wrote and `middleware.ts` reads the
    // cookie. Refresh first or the push races the stale one and bounces back to /become.
    router.refresh();
    router.push('/shows?welcome=1');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Display name" htmlFor="name">
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
          autoComplete="organization"
        />
        <p className="text-[13px] text-fg-muted">Shown to buyers on your show pages</p>
      </Field>

      {hasFailed && (
        <p
          role="alert"
          className="rounded-control border border-danger/40 p-3 text-[13px] text-danger"
        >
          Couldn&apos;t set that up. Try again.
        </p>
      )}

      <Button type="submit" disabled={isSubmitting || name.trim() === ''}>
        {isSubmitting ? 'Setting you up…' : 'Become an organizer'}
      </Button>

      <p className="text-[13px] text-fg-faint">You keep your existing tickets and orders.</p>
    </form>
  );
}
