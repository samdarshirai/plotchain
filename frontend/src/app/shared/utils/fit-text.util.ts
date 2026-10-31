// The Invoice registers cap amount columns at ~98px. Values up to 11 characters (9,99,999.99) fit at the normal
// size; longer ones (up to 99,99,99,99,999.99) step the font down so the whole number shows.
export type FitSize = 'md' | 'sm';

export function fitSize(text: string | number | null | undefined): FitSize | null {
  const length = String(text ?? '').length;
  return length >= 14 ? 'sm' : length >= 12 ? 'md' : null;
}
