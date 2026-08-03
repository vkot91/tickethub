'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, FormError, FormField } from '@tickethub/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

  // RHF never validates on mount, so `formState.isValid` starts `false` even though the prefilled
  // `email` is already a valid name — it only starts reflecting reality once the field is dirty
  // (RHF revalidates on every change once `isValid` is read, regardless of `mode`).
  //
  // An earlier fix called `form.trigger()` from a mount effect to settle `isValid` early, but
  // that is itself async: React StrictMode's double-invoked effects fire two concurrent
  // `trigger()` calls from one mount, and any real interaction landing before either settles
  // (autofill, a fast paste) can have its own, current validation result overwritten by one of
  // theirs resolving later with a stale, pre-interaction snapshot — whichever call resolves last
  // wins, and RHF's `trigger()` has no built-in way to discard a call once superseded. A second
  // `trigger()` call to "correct" the first has the same problem one level down.
  //
  // Parsing the prefilled value with the same schema synchronously sidesteps the whole class of
  // races — there is no promise for anything to interleave with. `isDirty` is the handoff point:
  // false until the user's first change event, which is also the first moment RHF's own `isValid`
  // starts being trustworthy.
  const [isPrefillValid] = useState(() => becomeFormSchema.safeParse({ name: email }).success);

  const isNameValid = form.formState.isDirty ? form.formState.isValid : isPrefillValid;

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

      <Button type="submit" disabled={form.formState.isSubmitting || !isNameValid}>
        {form.formState.isSubmitting ? 'Setting you up…' : 'Become an organizer'}
      </Button>

      <p className="text-[13px] text-fg-faint">You keep your existing tickets and orders.</p>
    </Form>
  );
}
