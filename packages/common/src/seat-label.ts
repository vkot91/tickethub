/**
 * The one seat-label format in the system: `"<Section> <RowLetter><Seat>"`, so row 1 seat 2 in
 * "Parterre" is `"Parterre A2"`.
 *
 * It lives here so the gateway (buyer's order) and `apps/fulfillment` (ticket snapshot) cannot
 * drift apart — they meet on the scanner screen, labelling the same seat.
 *
 * Rows past 26 are spreadsheet-style (`27 → AA`) rather than the `"["` that a bare
 * `64 + rowNumber` would produce.
 */
export function seatLabel(section: string, rowNumber: number, seatNumber: number): string {
  let remaining = rowNumber;
  let letters = '';

  while (remaining > 0) {
    letters = String.fromCharCode(65 + ((remaining - 1) % 26)) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return `${section} ${letters}${seatNumber}`;
}
