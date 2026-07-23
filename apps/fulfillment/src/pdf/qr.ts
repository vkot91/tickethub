import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

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

export function renderQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, { type: 'png', errorCorrectionLevel: 'M' });
}
