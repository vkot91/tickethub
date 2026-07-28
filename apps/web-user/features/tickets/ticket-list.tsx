'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Button, Card, Skeleton } from '@tickethub/ui';

import { fetchTickets, ticketKeys } from './api';
import { TicketCard } from './ticket-card';

export function TicketList() {
  const { data, isPending } = useQuery({
    queryKey: ticketKeys.list(),
    queryFn: fetchTickets,
  });

  if (isPending) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-60 rounded-panel" />
        ))}
      </div>
    );
  }

  const tickets = data?.items ?? [];

  if (tickets.length === 0) {
    return (
      <Card radius="panel" padding="lg" className="text-center">
        <p className="mb-5 text-sm text-fg-muted">
          Tickets appear here once an order is paid — they are emailed as a PDF too.
        </p>
        <Button asChild>
          <Link href="/orders">My orders</Link>
        </Button>
      </Card>
    );
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <TicketCard ticket={ticket} />
        </li>
      ))}
    </ul>
  );
}
