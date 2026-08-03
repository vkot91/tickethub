import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

import { renderQrPng, signTicketToken } from './qr';
import { renderTicketPdf } from './ticket-pdf';

async function countEmbeddedImages(pdfBytes: Buffer): Promise<number> {
  const loadedDoc = await PDFDocument.load(pdfBytes);
  let imageCount = 0;

  for (const [, indirectObject] of loadedDoc.context.enumerateIndirectObjects()) {
    if (indirectObject instanceof PDFRawStream) {
      const subtype = indirectObject.dict.get(PDFName.of('Subtype'));

      if (subtype?.toString() === '/Image') imageCount += 1;
    }
  }

  return imageCount;
}

async function decodedNonImageStreams(pdfBytes: Buffer): Promise<string[]> {
  const loadedDoc = await PDFDocument.load(pdfBytes);
  const decodedChunks: string[] = [];

  for (const [, indirectObject] of loadedDoc.context.enumerateIndirectObjects()) {
    if (indirectObject instanceof PDFRawStream) {
      const subtype = indirectObject.dict.get(PDFName.of('Subtype'));

      if (subtype?.toString() !== '/Image') {
        decodedChunks.push(
          Buffer.from(decodePDFRawStream(indirectObject).decode()).toString('latin1'),
        );
      }
    }
  }

  return decodedChunks;
}

function utf16BeHexToString(hex: string): string {
  const bytes = Buffer.from(hex, 'hex');
  const codeUnits: number[] = [];

  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    codeUnits.push(bytes.readUInt16BE(offset));
  }

  return String.fromCharCode(...codeUnits);
}

// The embedded Unicode fonts are subsetted, so the content stream carries *glyph ids*, not
// characters. Every embedded font also ships a ToUnicode CMap (`<glyphId> <utf16be>` pairs) —
// exactly what a PDF reader uses to turn those ids back into text. Decoding through it proves the
// ticket is genuinely readable, not merely that some bytes were drawn.
function buildGlyphToUnicodeMaps(streams: string[]): Map<string, string>[] {
  const mapPerFont: Map<string, string>[] = [];

  for (const stream of streams) {
    if (!stream.includes('beginbfchar')) continue;

    const glyphToUnicode = new Map<string, string>();

    for (const [, glyphIdHex, unicodeHex] of stream.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      glyphToUnicode.set(glyphIdHex.toUpperCase(), utf16BeHexToString(unicodeHex));
    }

    mapPerFont.push(glyphToUnicode);
  }

  return mapPerFont;
}

// Each embedded font subsets independently, so glyph ids only mean anything against their own
// CMap. Rather than track `Tf` operators, decode every drawn string with every font's map and keep
// the readings that resolve completely — a line drawn in the bold face simply decodes cleanly
// under the bold map and not under the regular one.
function decodeDrawnText(streams: string[], mapPerFont: Map<string, string>[]): string[] {
  const drawnLines: string[] = [];

  for (const stream of streams) {
    if (!stream.includes('Tj')) continue;

    for (const [, hexString] of stream.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      const glyphIds = hexString.toUpperCase().match(/.{4}/g) ?? [];

      for (const glyphToUnicode of mapPerFont) {
        if (glyphIds.every((glyphId) => glyphToUnicode.has(glyphId))) {
          drawnLines.push(glyphIds.map((glyphId) => glyphToUnicode.get(glyphId)).join(''));
        }
      }
    }
  }

  return drawnLines;
}

async function drawnTextOf(pdfBytes: Buffer): Promise<string[]> {
  const streams = await decodedNonImageStreams(pdfBytes);

  return decodeDrawnText(streams, buildGlyphToUnicodeMaps(streams));
}

async function pageCountOf(pdfBytes: Buffer): Promise<number> {
  return (await PDFDocument.load(pdfBytes)).getPageCount();
}

describe('renderTicketPdf', () => {
  const showTitle = 'Hamilton';
  const startsAt = '2026-08-15T19:30:00.000Z';
  const orderId = 'order-abc-123';

  async function buildSeat(seatLabel: string, tier = 'Stalls') {
    return { seatLabel, tier, qrPng: await renderQrPng(signTicketToken(seatLabel, 'top-secret')) };
  }

  async function twoSeats() {
    return [await buildSeat('A1'), await buildSeat('A2', 'Balcony')];
  }

  it('produces a well-formed PDF buffer', async () => {
    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seats: await twoSeats() });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  // The point of the per-seat regrain: one scannable page per seat, so a party of three cannot
  // walk in on a single scan.
  it('renders one page per seat', async () => {
    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seats: await twoSeats() });

    expect(await pageCountOf(pdf)).toBe(2);
  });

  it('embeds a distinct QR image for every seat', async () => {
    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seats: await twoSeats() });

    expect(await countEmbeddedImages(pdf)).toBe(2);
  });

  it('draws the order id, seat label and tier on each page', async () => {
    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seats: await twoSeats() });

    expect(await drawnTextOf(pdf)).toEqual(
      expect.arrayContaining([
        `Order: ${orderId}`,
        'Seat: A1',
        'Tier: Stalls',
        'Seat: A2',
        'Tier: Balcony',
      ]),
    );
  });

  it('draws the show title and formatted start time as text in the content stream', async () => {
    const pdf = await renderTicketPdf({
      showTitle,
      startsAt,
      orderId,
      seats: [await buildSeat('A1')],
    });

    expect(await drawnTextOf(pdf)).toEqual(
      expect.arrayContaining([showTitle, new Date(startsAt).toUTCString()]),
    );
  });

  // The standard WinAnsi fonts throw on any character outside Latin-1, which used to take the
  // whole ticket down (nack → an undeclared DLX → message dropped) for every buyer of that show.
  it('renders a Cyrillic show title and seat labels instead of throwing', async () => {
    const cyrillicTitle = 'Кіно у Львові';

    const pdf = await renderTicketPdf({
      showTitle: cyrillicTitle,
      startsAt,
      orderId,
      seats: [await buildSeat('Партер 1-2', 'Партер')],
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // Not merely "did not throw": the Cyrillic must come back out of the PDF verbatim, so a
    // sanitiser that replaced it with '?' would fail here too.
    expect(await drawnTextOf(pdf)).toEqual(
      expect.arrayContaining([cyrillicTitle, 'Seat: Партер 1-2']),
    );
  });
});
