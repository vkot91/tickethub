'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Button, Form, FormError, FormField } from '@tickethub/ui';

import { becomeOrganizerAction } from './actions';
import { becomeFormSchema, type BecomeForm as BecomeFormValues } from './become-form-schema';

/** The email is prefilled from the server component rather than fetched again on the client —
 *  the session is already decoded one hop earlier. */
export function BecomeForm({ email }: { email: string }) {
  const router = useRouter();

  const form = useForm<BecomeFormValues>({
    resolver: zodResolver(becomeFormSchema),
    mode: 'onTouched',
    defaultValues: { name: email },
  });

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

      {/* ponytail: not disabled on validity — handleSubmit already blocks an invalid submit and
          shows the field error. Disable here only if a blocked click turns out to confuse people. */}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Setting you up…' : 'Become an organizer'}
      </Button>

      <p className="text-[13px] text-fg-faint">You keep your existing tickets and orders.</p>
    </Form>
  );
}
