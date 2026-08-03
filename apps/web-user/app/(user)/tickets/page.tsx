import { type Metadata } from 'next';

import { TicketList } from '@/features/tickets/ticket-list';

export const metadata: Metadata = { title: 'My tickets' };

export default function TicketsPage() {
  return (
    <div className="mx-auto max-w-295 [animation:var(--animate-fade)] px-6 pt-9 pb-22.5">
      <h1 className="mb-2 font-display text-[32px] font-semibold tracking-[-0.02em]">My tickets</h1>
      <p className="mb-8 text-[15px] text-fg-muted">
        Show the QR at the gate. Each ticket scans once.
      </p>

      <TicketList />
    </div>
  );
}
