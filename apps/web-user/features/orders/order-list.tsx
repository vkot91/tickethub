'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Button, Card, Skeleton } from '@tickethub/ui';

import { fetchOrders, orderKeys } from './api';
import { OrderCard } from './order-card';

export function OrderList() {
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: orderKeys.list(),
    queryFn: ({ pageParam }) => fetchOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-37.5 rounded-card" />
        ))}
      </div>
    );
  }

  const orders = data?.pages.flatMap((page) => page.items) ?? [];

  if (orders.length === 0) {
    return (
      <Card radius="panel" padding="lg" className="text-center">
        <p className="mb-5 text-sm text-fg-muted">You have not booked anything yet.</p>
        <Button asChild>
          <Link href="/">Browse shows</Link>
        </Button>
      </Card>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {orders.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} />
          </li>
        ))}
      </ul>

      {hasNextPage ? (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </>
  );
}
