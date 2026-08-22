import { titleCase } from './title-case';

describe('titleCase', () => {
  it('returns an empty string unchanged', () => {
    expect(titleCase('')).toBe('');
  });

  it('title-cases a single SCREAMING_SNAKE_CASE word', () => {
    expect(titleCase('PENDING')).toBe('Pending');
  });

  it('replaces underscores with spaces and title-cases each word', () => {
    expect(titleCase('CARRIED_FORWARD')).toBe('Carried Forward');
    expect(titleCase('SPONSOR_MATCHING')).toBe('Sponsor Matching');
    expect(titleCase('DIRECT_INCOME')).toBe('Direct Income');
  });

  it('uppercases the first letter even when the input is lowercase', () => {
    expect(titleCase('carried_forward')).toBe('Carried Forward');
    expect(titleCase('pending')).toBe('Pending');
  });

  it('normalises mixed-case input', () => {
    expect(titleCase('cArRiEd_fOrWaRd')).toBe('Carried Forward');
  });

  it('tolerates leading, trailing and repeated underscores', () => {
    expect(titleCase('_PAID')).toBe(' Paid');
    expect(titleCase('PAID_')).toBe('Paid ');
    expect(titleCase('A__B')).toBe('A  B');
  });
});
