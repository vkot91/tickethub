import { PDFDocument } from 'pdf-lib';

import { createPdfDocument, drawLines, toBuffer } from './document';

describe('createPdfDocument', () => {
  it('embeds a Unicode face so Cyrillic text does not throw', async () => {
    const pdf = await createPdfDocument();
    const page = pdf.addPage();

    // pdf-lib's standard WinAnsi fonts throw on anything outside Latin-1. This is the whole
    // reason the package vendors DejaVu — a Ukrainian show title is the norm here.
    expect(() =>
      page.drawText('Вистава «Тіні забутих предків»', {
        x: 40,
        y: 400,
        size: 12,
        font: pdf.fonts.regular,
      }),
    ).not.toThrow();
  });

  it('exposes a bold face distinct from the regular one', async () => {
    const pdf = await createPdfDocument();

    expect(pdf.fonts.bold).not.toBe(pdf.fonts.regular);
  });

  it('defaults to A5 and honours an explicit A4', async () => {
    const pdf = await createPdfDocument();

    const a5 = pdf.addPage();
    const a4 = pdf.addPage('A4');

    expect(Math.round(a5.getSize().width)).toBe(420);
    expect(Math.round(a4.getSize().width)).toBe(595);
  });

  it('produces bytes that parse back as a PDF with one page per addPage', async () => {
    const pdf = await createPdfDocument();

    pdf.addPage();
    pdf.addPage();

    const bytes = await toBuffer(pdf);
    const reparsed = await PDFDocument.load(bytes);

    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(reparsed.getPageCount()).toBe(2);
  });
});

describe('drawLines', () => {
  it('returns the cursor below the last line, advanced by each line gap', async () => {
    const pdf = await createPdfDocument();
    const page = pdf.addPage();

    const cursorY = drawLines(page, {
      x: 40,
      startY: 500,
      lines: [
        { text: 'TicketHub', size: 20, font: pdf.fonts.bold, gap: 36 },
        { text: 'Row 1', size: 12, font: pdf.fonts.regular, gap: 20 },
      ],
    });

    expect(cursorY).toBe(500 - 36 - 20);
  });

  it('falls back to a gap proportional to the font size when none is given', async () => {
    const pdf = await createPdfDocument();
    const page = pdf.addPage();

    const cursorY = drawLines(page, {
      x: 40,
      startY: 500,
      lines: [{ text: 'Seats: A1', size: 12, font: pdf.fonts.regular }],
    });

    expect(cursorY).toBe(500 - 18);
  });

  it('skips empty lines so an absent optional field leaves no gap', async () => {
    const pdf = await createPdfDocument();
    const page = pdf.addPage();

    const cursorY = drawLines(page, {
      x: 40,
      startY: 500,
      lines: [
        { text: '', size: 12, font: pdf.fonts.regular, gap: 20 },
        { text: 'Order: 1234', size: 12, font: pdf.fonts.regular, gap: 20 },
      ],
    });

    expect(cursorY).toBe(500 - 20);
  });
});
