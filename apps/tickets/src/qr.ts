import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import QRCode from 'qrcode';

/**
 * Ticket ids are *derived*, not random. The PDF is rendered (and its QR tokens signed) before the
 * rows are inserted, so a random id would make a redelivery of order.paid render a second PDF
 * carrying tokens that match nothing in the database — while overwriting the first one at the same
 * S3 key. Deriving from (orderId, seatId) makes every retry produce byte-identical tokens, so the
 * overwrite is a no-op and the stored rows and the stored document can never disagree.
 *
 * Formatted as a v5-shaped UUID because the column is `uuid`; the namespace hash is what carries
 * the uniqueness, the version/variant bits are cosmetic.
 */
export function deriveTicketId(orderId: string, seatId: string): string {
  const hex = createHash('sha256').update(`${orderId}:${seatId}`).digest('hex');

  const version = `5${hex.slice(13, 16)}`;
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}-${variant}-${hex.slice(20, 32)}`;
}

const sign = (ticketId: string, secret: string) =>
  createHmac('sha256', secret).update(ticketId).digest('base64url');

export function signTicketToken(ticketId: string, secret: string): string {
  return `${ticketId}.${sign(ticketId, secret)}`;
}

export function verifyTicketToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;

  const ticketId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(ticketId, secret));

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  return ticketId;
}

/**
 * The code a human reads off the ticket — the first eight hex characters of the derived id. It
 * carries no signature, so it is never a credential on its own: the gate resolves it to a real
 * `qrToken` and only then runs the admission, and the lookup is always scoped to one show.
 */
export const displayCode = (ticketId: string) =>
  `TH-${ticketId.slice(0, 4)}-${ticketId.slice(4, 8)}`.toUpperCase();

const DISPLAY_CODE = /^TH-([0-9a-f]{4})-([0-9a-f]{4})$/i;

/**
 * The id prefix a display code names, or `null` for anything that is not one. Shape-checked
 * before any query, so a forged token still costs a string comparison rather than a table scan.
 */
export function parseDisplayCode(code: string): string | null {
  const match = DISPLAY_CODE.exec(code.trim());

  return match ? `${match[1]}${match[2]}`.toLowerCase() : null;
}

export function renderQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: 'png', errorCorrectionLevel: 'M' });
}
