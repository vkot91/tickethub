import { createPdfDocument, drawLines, toBuffer } from '@tickethub/pdf';

export interface TicketPdfSeat {
  seatLabel: string;
  tier: string;
  qrPng: Buffer;
}

export interface RenderTicketPdfInput {
  showTitle: string;
  startsAt: string;
  orderId: string;
  seats: TicketPdfSeat[];
}

const QR_SIZE = 180;
const PAGE_MARGIN = 40;

/**
 * One document per order, one **page per seat** — each page carries that seat's own QR, so a
 * three-seat order prints three separately scannable admissions rather than one code that lets
 * the whole party through on a single scan.
 *
 * Layout lives here rather than in `@tickethub/pdf` on purpose: the package owns fonts and page
 * mechanics, this owns what a ticket looks like.
 */
export async function renderTicketPdf({
  showTitle,
  startsAt,
  orderId,
  seats,
}: RenderTicketPdfInput): Promise<Buffer> {
  const pdf = await createPdfDocument('A5');
  const { regular, bold } = pdf.fonts;

  for (const seat of seats) {
    const page = pdf.addPage();
    const { width, height } = page.getSize();

    const cursorY = drawLines(page, {
      x: PAGE_MARGIN,
      startY: height - PAGE_MARGIN,
      lines: [
        { text: 'TicketHub', size: 20, font: bold, gap: 36 },
        { text: showTitle, size: 16, font: bold, gap: 24 },
        { text: new Date(startsAt).toUTCString(), size: 12, font: regular, gap: 20 },
        { text: `Order: ${orderId}`, size: 12, font: regular, gap: 20 },
        { text: `Seat: ${seat.seatLabel}`, size: 12, font: regular, gap: 20 },
        { text: `Tier: ${seat.tier}`, size: 12, font: regular, gap: 24 },
      ],
    });

    const qrImage = await pdf.doc.embedPng(seat.qrPng);

    page.drawImage(qrImage, {
      x: (width - QR_SIZE) / 2,
      y: cursorY - QR_SIZE,
      width: QR_SIZE,
      height: QR_SIZE,
    });
  }

  return toBuffer(pdf);
}
