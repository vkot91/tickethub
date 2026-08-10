import { Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { Button, Card, formatShowDateTime, Poster } from '@tickethub/ui';

import { type Ticket } from './api';
import { TicketStatusPill } from './ticket-status';

export function TicketCard({ ticket }: { ticket: Ticket }) {
  const isUsable = ticket.status === 'active';

  return (
    <Card padding="none" radius="panel" className="overflow-hidden" asChild>
      <article>
        <Poster seed={ticket.orderId} className="h-24">
          <span className="absolute inset-0 bg-linear-to-t from-page/85 to-page/30" />

          <div className="relative flex h-full flex-col justify-end gap-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-base font-semibold">{ticket.showTitle}</h2>
              <TicketStatusPill status={ticket.status} />
            </div>
            <p className="font-mono text-[11px] text-fg-muted">
              {formatShowDateTime(ticket.showStartsAt)}
              {ticket.venueName ? ` · ${ticket.venueName}` : ''}
            </p>
          </div>
        </Poster>

        <div className="flex gap-4 p-5">
          <div className="rounded-control bg-white p-2">
            {/* The QR carries the tickets service's HMAC token — the scanner reads this,
                not the ticket id, so a guessed id cannot get anyone through the gate. */}
            <QRCodeSVG
              value={ticket.qrToken}
              size={84}
              level="M"
              aria-label={`Ticket QR code for seat ${ticket.seatLabel}`}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-display text-2xl font-semibold">{ticket.seatLabel}</p>
            <p className="mb-1 text-[13px] text-fg-muted">{ticket.tier}</p>
            <p className="mb-4 truncate font-mono text-[11px] text-fg-faint">{ticket.code}</p>

            {ticket.pdfUrl ? (
              <Button asChild variant="secondary" size="sm" className="mt-auto self-start">
                <a href={`/api/gateway${ticket.pdfUrl}`} download>
                  <Download aria-hidden className="size-3.5" />
                  Download PDF
                </a>
              </Button>
            ) : (
              <p className="mt-auto text-xs text-fg-faint">
                {isUsable ? 'PDF is still being generated.' : 'No PDF for this ticket.'}
              </p>
            )}
          </div>
        </div>
      </article>
    </Card>
  );
}
