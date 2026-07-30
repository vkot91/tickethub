'use client';

import { useState } from 'react';

import { Toast, ToastProvider, ToastViewport } from '@tickethub/ui';

/** The success toast for `/become`, which redirects away before it could show one of its own.
 *  ponytail: a `?welcome=1` search param, not a toast store — one screen hands off to one other. */
export function WelcomeToast() {
  const [open, setOpen] = useState(true);

  return (
    <ToastProvider swipeDirection="right">
      <Toast
        open={open}
        onOpenChange={setOpen}
        duration={6000}
        title="You're an organizer"
        body="Start by creating a show."
      />
      <ToastViewport />
    </ToastProvider>
  );
}
