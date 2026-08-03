'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, FormError, FormField } from '@tickethub/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { becomeFormSchema, type BecomeForm as BecomeFormValues } from './become-form-schema';
import { becomeOrganizerAction } from './actions';

/** The email is prefilled from the server component rather than fetched again on the client —
 *  the session is already decoded one hop earlier. */
export function BecomeForm({ email }: { email: string }) {
  const router = useRouter();

  const form = useForm<BecomeFormValues>({
    resolver: zodResolver(becomeFormSchema),
    mode: 'onTouched',
    defaultValues: { name: email },
  });

  // `mode: 'onTouched'` skips validation on mount, so `isValid` starts `false` even though
  // `defaultValues.name` (the prefilled email) is already valid. Trigger once on mount so the
  // submit button reflects the actual prefilled value instead of penalizing an untouched field.
  useEffect(() => {
    void form.trigger();
  }, [form]);

  async function submit({ name }: BecomeFormValues) {
    try {
      await becomeOrganizerAction(name);
    } catch {
      form.setError('root', { message: "Couldn't set that up. Try again." });

      return;
    }

    // The new role lives in the cookies the action just wrote and `middleware.ts` reads the
    // cookie. Refresh first or the push races the stale one and bounces back to /become.
    router.refresh();
    router.push('/shows?welcome=1');
  }

  return (
    <Form form={form} onSubmit={submit} className="flex flex-col gap-5">
      <FormField
        name="name"
        label="Display name"
        hint="Shown to buyers on your show pages"
        autoComplete="organization"
      />

      <FormError />

      <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid}>
        {form.formState.isSubmitting ? 'Setting you up…' : 'Become an organizer'}
      </Button>

      <p className="text-[13px] text-fg-faint">You keep your existing tickets and orders.</p>
    </Form>
  );
}
