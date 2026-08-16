import { TestBed } from '@angular/core/testing';
import { ThemeService, contrastRatio } from './theme.service';

describe('contrastRatio', () => {
  it('returns 21 for maximum contrast (white on black)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('returns 1 for identical colors (no contrast)', () => {
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#FFFFFF', '#000000');
    const b = contrastRatio('#000000', '#FFFFFF');
    expect(a).toBeCloseTo(b, 10);
  });

  it('matches the well-known WCAG AA boundary gray (#767676 on white)', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 1);
  });
});

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--brand-primary');
    document.documentElement.style.removeProperty('--brand-secondary');
    document.documentElement.style.removeProperty('--brand-primary-bright');
    document.documentElement.style.removeProperty('--brand-primary-contrast');
  });

  it('applies theme properties to a detached target without touching document.documentElement', () => {
    const target = document.createElement('div');

    service.apply('#1A1A2E', '#FF00FF', target);

    expect(target.style.getPropertyValue('--brand-primary')).toBe('#1A1A2E');
    expect(target.style.getPropertyValue('--brand-secondary')).toBe('#FF00FF');
    expect(target.style.getPropertyValue('--brand-primary-contrast')).toBe('#FFFFFF');

    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--brand-secondary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--brand-primary-contrast')).toBe('');
  });

  it('applies theme properties to document.documentElement when no target is given', () => {
    service.apply('#1A1A2E', '#FF00FF');

    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#1A1A2E');
    expect(document.documentElement.style.getPropertyValue('--brand-secondary')).toBe('#FF00FF');
    expect(document.documentElement.style.getPropertyValue('--brand-primary-contrast')).toBe('#FFFFFF');
  });

  it('resolves a light primary color to the dark contrast color', () => {
    const target = document.createElement('div');

    service.apply('#FFFF00', '#000000', target);

    expect(target.style.getPropertyValue('--brand-primary-contrast')).toBe('#0B1020');
  });

  it('resolves a dark primary color to the light contrast color', () => {
    const target = document.createElement('div');

    service.apply('#1A1A2E', '#000000', target);

    expect(target.style.getPropertyValue('--brand-primary-contrast')).toBe('#FFFFFF');
  });

  it('re-derives the :root-only derived brand tokens onto a scoped preview target', () => {
    const target = document.createElement('div');
    const child = document.createElement('span');
    target.appendChild(child);
    document.body.appendChild(target);

    service.apply('#1A1A2E', '#FF00FF', target);

    // The gradient's far stop is a derived "bright" tint of primary, not the (unrelated)
    // secondary color -- see ThemeService.apply's comment on why there's no design-doc value
    // to reuse for a company-picked custom color.
    expect(target.style.getPropertyValue('--brand-primary-bright')).toBe('color-mix(in srgb, #1A1A2E 60%, white)');
    expect(target.style.getPropertyValue('--brand-gradient')).toContain('#1A1A2E');
    expect(target.style.getPropertyValue('--brand-gradient')).toContain('color-mix(in srgb, #1A1A2E 60%, white)');
    expect(target.style.getPropertyValue('--brand-primary-soft')).toContain('#1A1A2E');
    expect(target.style.getPropertyValue('--brand-primary-hover')).toContain('#1A1A2E');
    expect(target.style.getPropertyValue('--brand-secondary-soft')).toContain('#FF00FF');

    // A descendant should see the scoped derived tokens too, via normal custom-property
    // inheritance - not just the flat --brand-primary/--brand-secondary values.
    expect(getComputedStyle(child).getPropertyValue('--brand-gradient')).toContain('#1A1A2E');

    document.body.removeChild(target);
  });
});
