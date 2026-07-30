import { seatLabel } from './seat-label';

describe('seatLabel', () => {
  it('renders row 1 seat 2 in "Parterre" as "Parterre A2"', () => {
    expect(seatLabel('Parterre', 1, 2)).toBe('Parterre A2');
  });

  it('walks the alphabet with the row number', () => {
    expect(seatLabel('Balcony', 26, 7)).toBe('Balcony Z7');
  });

  // Past Z is spreadsheet-style, not the accidental "[" that `64 + rowNumber` produces.
  it('continues past Z as AA', () => {
    expect(seatLabel('Balcony', 27, 1)).toBe('Balcony AA1');
    expect(seatLabel('Balcony', 53, 1)).toBe('Balcony BA1');
  });
});
