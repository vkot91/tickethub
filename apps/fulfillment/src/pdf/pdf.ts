import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, PageSizes, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface RenderTicketPdfInput {
  showTitle: string;
  startsAt: string;
  orderId: string;
  seatLabels: string[];
  qrPng: Buffer;
}

const QR_SIZE = 180;
const PAGE_MARGIN = 40;

// Show titles and seat labels are free-form UTF-8 (this project is Ukrainian — a Cyrillic title is
// the norm, not an edge case). pdf-lib's standard fonts are WinAnsi-only and *throw* on any
// character outside Latin-1, which would lose the whole ticket. So we embed a real Unicode
// TrueType face instead. The files are vendored under src/assets/fonts and copied into dist by
// nest-cli's `compilerOptions.assets`, so the container needs no system fonts.
const FONTS_DIR = join(__dirname, '..', 'assets', 'fonts');
const REGULAR_FONT_FILE = join(FONTS_DIR, 'DejaVuSans.ttf');
const BOLD_FONT_FILE = join(FONTS_DIR, 'DejaVuSans-Bold.ttf');

interface TicketFontFiles {
  regular: Buffer;
  bold: Buffer;
}

// Read once per process: each render then only pays the (subsetted) embed, not the disk I/O.
let fontFilesPromise: Promise<TicketFontFiles> | undefined;

function loadFontFiles(): Promise<TicketFontFiles> {
  fontFilesPromise ??= Promise.all([readFile(REGULAR_FONT_FILE), readFile(BOLD_FONT_FILE)]).then(
    ([regular, bold]) => ({ regular, bold }),
  );

  return fontFilesPromise;
}

export async function renderTicketPdf({
  showTitle,
  startsAt,
  orderId,
  seatLabels,
  qrPng,
}: RenderTicketPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.A5);
  const { width } = page.getSize();

  const fontFiles = await loadFontFiles();

  doc.registerFontkit(fontkit);

  // `subset: true` embeds only the glyphs actually drawn, so a full Unicode face costs a few KB.
  const regular: PDFFont = await doc.embedFont(fontFiles.regular, { subset: true });
  const bold: PDFFont = await doc.embedFont(fontFiles.bold, { subset: true });

  let cursorY = page.getSize().height - PAGE_MARGIN;

  page.drawText('TicketHub', { x: PAGE_MARGIN, y: cursorY, size: 20, font: bold });
  cursorY -= 36;

  page.drawText(showTitle, { x: PAGE_MARGIN, y: cursorY, size: 16, font: bold });
  cursorY -= 24;

  page.drawText(new Date(startsAt).toUTCString(), {
    x: PAGE_MARGIN,
    y: cursorY,
    size: 12,
    font: regular,
  });
  cursorY -= 20;

  page.drawText(`Order: ${orderId}`, { x: PAGE_MARGIN, y: cursorY, size: 12, font: regular });
  cursorY -= 20;

  page.drawText(`Seats: ${seatLabels.join(', ')}`, {
    x: PAGE_MARGIN,
    y: cursorY,
    size: 12,
    font: regular,
  });
  cursorY -= 24;

  const qrImage = await doc.embedPng(qrPng);
  const qrX = (width - QR_SIZE) / 2;
  const qrY = cursorY - QR_SIZE;

  page.drawImage(qrImage, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });

  const pdfBytes = await doc.save();

  return Buffer.from(pdfBytes);
}
