'use client';

import { useEffect } from 'react';

import { toast } from '@tickethub/ui';

/** The success toast for `/become`, which server-redirects away before it could show one of its
 *  own. ponytail: a `?welcome=1` search param, because `redirect()` discards the client store. */
export function WelcomeToast() {
  useEffect(() => {
    const id = toast.add('success', {
      title: "You're an organizer",
      body: 'Start by creating a show.',
      duration: 6000,
    });

    // Also undoes StrictMode's double-mount in dev, which would otherwise queue two.
    return () => toast.remove(id);
  }, []);

  return null;
}
