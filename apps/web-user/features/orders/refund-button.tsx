'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button, ConfirmDialog, formatPrice } from '@tickethub/ui';

import { orderKeys, requestRefund } from './api';

interface RefundButtonProps {
  orderId: string;
  totalCents: number;
}

export function RefundButton({ orderId, totalCents }: RefundButtonProps) {
  const queryClient = useQueryClient();

  const refund = useMutation({
    mutationFn: () => requestRefund(orderId),
    // The order only reaches `refunded` once Stripe confirms, so refetch rather than assume.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="secondary" size="sm" disabled={refund.isPending}>
            Request refund
          </Button>
        }
        title="Refund this order?"
        body={`${formatPrice(totalCents)} goes back to the card you paid with, and the seats are released for someone else. This cannot be undone.`}
        confirmLabel="Refund"
        isPending={refund.isPending}
        onConfirm={() => refund.mutate()}
      />

      {refund.isError ? (
        <p role="alert" className="text-xs text-danger">
          {refund.error.message}
        </p>
      ) : null}

      {refund.isSuccess ? (
        <p className="text-xs text-fg-muted">Refund requested — this can take a few days.</p>
      ) : null}
    </div>
  );
}
