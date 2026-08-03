import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import fontkit from '@pdf-lib/fontkit';
import { PageSizes, PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

export type PageSize = 'A4' | 'A5';

export interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

export interface PdfDocument {
  doc: PDFDocument;
  fonts: PdfFonts;
  addPage(size?: PageSize): PDFPage;
}

// Titles and seat labels are free-form UTF-8 (this project is Ukrainian — a Cyrillic title is
// the norm, not an edge case). pdf-lib's standard fonts are WinAnsi-only and *throw* on any
// character outside Latin-1, so every document here embeds a real Unicode TrueType face.
// Resolved from the package root, not from `src`/`dist`, so the same path works whether the
// consumer imports the TS sources (development condition) or the compiled output.
const FONTS_DIR = join(__dirname, '..', 'fonts');
const REGULAR_FONT_FILE = join(FONTS_DIR, 'DejaVuSans.ttf');
const BOLD_FONT_FILE = join(FONTS_DIR, 'DejaVuSans-Bold.ttf');

interface FontFiles {
  regular: Buffer;
  bold: Buffer;
}

// Read once per process: each document then only pays the (subsetted) embed, not the disk I/O.
let fontFilesPromise: Promise<FontFiles> | undefined;

function loadFontFiles(): Promise<FontFiles> {
  fontFilesPromise ??= Promise.all([readFile(REGULAR_FONT_FILE), readFile(BOLD_FONT_FILE)]).then(
    ([regular, bold]) => ({ regular, bold }),
  );

  return fontFilesPromise;
}

export async function createPdfDocument(defaultSize: PageSize = 'A5'): Promise<PdfDocument> {
  const doc = await PDFDocument.create();

  doc.registerFontkit(fontkit);

  const fontFiles = await loadFontFiles();

  // `subset: true` embeds only the glyphs actually drawn, so a full Unicode face costs a few KB.
  const [regular, bold] = await Promise.all([
    doc.embedFont(fontFiles.regular, { subset: true }),
    doc.embedFont(fontFiles.bold, { subset: true }),
  ]);

  return {
    doc,
    fonts: { regular, bold },
    addPage: (size: PageSize = defaultSize) => doc.addPage(PageSizes[size]),
  };
}

export interface TextLine {
  text: string;
  size: number;
  font: PDFFont;
  /** Vertical space consumed by this line. Defaults to 1.5× the font size. */
  gap?: number;
}

export interface DrawLinesOptions {
  x: number;
  startY: number;
  lines: TextLine[];
}

/** Draws a stack of left-aligned lines top-down and returns the cursor below the last one. */
export function drawLines(page: PDFPage, { x, startY, lines }: DrawLinesOptions): number {
  let cursorY = startY;

  for (const line of lines) {
    // An empty string is an absent optional field, not a blank line: drawing it is a no-op and
    // charging a gap for it would leave a hole in the layout.
    if (line.text === '') continue;

    page.drawText(line.text, { x, y: cursorY, size: line.size, font: line.font });

    cursorY -= line.gap ?? line.size * 1.5;
  }

  return cursorY;
}

export async function toBuffer(pdf: PdfDocument): Promise<Buffer> {
  return Buffer.from(await pdf.doc.save());
}
