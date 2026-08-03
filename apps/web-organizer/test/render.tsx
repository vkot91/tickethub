import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { Toaster } from '@tickethub/ui';
import { type ReactNode } from 'react';

/** A fresh client per test — no retries, so a mocked failure surfaces on the first tick. */
export function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  // The Toaster is mounted here for the same reason it is in the root layout: it is the app's
  // only one, and screens fire into it with `toast()` rather than rendering their own.
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}
