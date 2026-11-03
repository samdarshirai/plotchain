import { formatIst } from './ist-date';

describe('formatIst', () => {
  it('renders in IST regardless of browser timezone', () => {
    expect(formatIst('2026-01-01T00:00:00Z')).toBe('1 Jan 2026, 05:30:00');
  });
  it('gives a dash for empty or invalid input', () => {
    expect(formatIst(null)).toBe('—');
    expect(formatIst('nope')).toBe('—');
  });
});
