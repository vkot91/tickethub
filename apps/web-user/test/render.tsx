import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { type ReactNode } from 'react';

/** A fresh client per test — no retries, so a mocked failure surfaces on the first tick. */
export function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
