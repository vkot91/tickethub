import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

import { renderTicketPdf } from './pdf';
import { renderQrPng, signTicketToken } from './qr';

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

describe('renderTicketPdf', () => {
  const showTitle = 'Hamilton';
  const startsAt = '2026-08-15T19:30:00.000Z';
  const orderId = 'order-abc-123';
  const seatLabels = ['A1', 'A2'];

  async function buildQrPng(): Promise<Buffer> {
    const token = signTicketToken('ticket-123', 'top-secret');

    return renderQrPng(token);
  }

  it('produces a well-formed PDF buffer', async () => {
    const qrPng = await buildQrPng();

    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seatLabels, qrPng });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('embeds the QR PNG as an image object in the PDF', async () => {
    const qrPng = await buildQrPng();

    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seatLabels, qrPng });

    expect(await countEmbeddedImages(pdf)).toBe(1);
  });

  it('draws the order id and seat labels as text in the content stream', async () => {
    const qrPng = await buildQrPng();

    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seatLabels, qrPng });

    expect(await drawnTextOf(pdf)).toEqual(
      expect.arrayContaining([`Order: ${orderId}`, `Seats: ${seatLabels.join(', ')}`]),
    );
  });

  it('draws the show title and formatted start time as text in the content stream', async () => {
    const qrPng = await buildQrPng();

    const pdf = await renderTicketPdf({ showTitle, startsAt, orderId, seatLabels, qrPng });

    expect(await drawnTextOf(pdf)).toEqual(
      expect.arrayContaining([showTitle, new Date(startsAt).toUTCString()]),
    );
  });

  // The standard WinAnsi fonts throw on any character outside Latin-1, which used to take the
  // whole ticket down (nack → an undeclared DLX → message dropped) for every buyer of that show.
  it('renders a Cyrillic show title and seat labels instead of throwing', async () => {
    const qrPng = await buildQrPng();
    const cyrillicTitle = 'Кіно у Львові';
    const cyrillicSeats = ['Партер 1-2', 'Партер 1-3'];

    const pdf = await renderTicketPdf({
      showTitle: cyrillicTitle,
      startsAt,
      orderId,
      seatLabels: cyrillicSeats,
      qrPng,
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // Not merely "did not throw": the Cyrillic must come back out of the PDF verbatim, so a
    // sanitiser that replaced it with '?' would fail here too.
    expect(await drawnTextOf(pdf)).toEqual(
      expect.arrayContaining([cyrillicTitle, `Seats: ${cyrillicSeats.join(', ')}`]),
    );
  });
});
