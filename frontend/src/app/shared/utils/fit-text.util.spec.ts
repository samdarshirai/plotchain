import { fitSize } from './fit-text.util';

describe('fitSize', () => {
  it('keeps the normal size up to 11 characters (99999999.99)', () => {
    expect(fitSize('99999999.99')).toBeNull();
    expect(fitSize('5.00')).toBeNull();
  });

  it('steps down to md at 12-13 characters', () => {
    expect(fitSize('123456789.50')).toBe('md');
    expect(fitSize('1234567890.50')).toBe('md');
  });

  it('steps down to sm at 14 characters and above (the 15-character maximum 999999999999.99)', () => {
    expect(fitSize('12345678901.50')).toBe('sm');
    expect(fitSize('999999999999.99')).toBe('sm');
  });

  it('copes with numbers and missing values', () => {
    expect(fitSize(1234567890.5)).toBe('md'); // 12 characters as a plain number
    expect(fitSize(null)).toBeNull();
    expect(fitSize(undefined)).toBeNull();
    expect(fitSize('')).toBeNull();
  });
});
