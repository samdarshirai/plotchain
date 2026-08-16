import { Injectable } from '@angular/core';

const WHITE = '#FFFFFF';
const INK = '#0B1020';

// Converts a single sRGB 0-255 channel to its linearized 0-1 value per the WCAG
// relative luminance definition (the piecewise gamma-correction step).
function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return [r, g, b];
}

// WCAG relative luminance: linearize each channel, then weight by the standard
// 0.2126/0.7152/0.0722 coefficients.
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

// WCAG contrast ratio between two colors, order-independent: the lighter luminance always
// sits in the numerator so callers don't have to sort foreground/background themselves.
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Sets brand custom properties on `target` (defaulting to the document root). Setting
  // inline style on any element scopes the custom properties to that element's subtree via
  // normal CSS custom-property inheritance, so passing a detached preview element keeps the
  // change from leaking app-wide.
  apply(primary: string, secondary: string, target: HTMLElement = document.documentElement): void {
    const contrastWithWhite = contrastRatio(WHITE, primary);
    const contrastWithInk = contrastRatio(INK, primary);
    const primaryContrast = contrastWithWhite >= contrastWithInk ? WHITE : INK;

    // _tokens.scss's :root default pairs --brand-primary with a hand-picked "bright" companion
    // (DESIGN.md's named Bright Gold) as the gradient's far stop -- not a formula. A
    // company-picked custom primary has no such named companion (the branding form only
    // captures primary/secondary), so one is derived here the same way _tokens.scss derives
    // --brand-primary-hover, just lighter, so it reads as a highlight step rather than a
    // hover-only nudge.
    const primaryBright = `color-mix(in srgb, ${primary} 60%, white)`;

    target.style.setProperty('--brand-primary', primary);
    target.style.setProperty('--brand-secondary', secondary);
    target.style.setProperty('--brand-primary-bright', primaryBright);
    target.style.setProperty('--brand-primary-contrast', primaryContrast);

    // `--brand-gradient`/`--brand-primary-soft`/`--brand-primary-hover`/`--brand-secondary-soft`
    // are declared once at :root in _tokens.scss, each referencing var(--brand-primary)/
    // var(--brand-primary-bright)/var(--brand-secondary) internally. A var() inside a
    // custom-property declaration always resolves using the value visible at the element where
    // THAT property is declared - so those :root-declared derived properties would keep
    // resolving against :root's colors even when `target` is a descendant with its own local
    // override (e.g. a live preview container). Re-declaring them directly on `target`,
    // computed from the literal/derived colors, makes the derived tokens scope correctly too.
    // Keep the --brand-primary-soft/--brand-primary-hover/--brand-secondary-soft formulas
    // byte-identical to _tokens.scss - that file is the source of truth; update both together.
    target.style.setProperty('--brand-gradient', `linear-gradient(135deg, ${primary}, ${primaryBright})`);
    target.style.setProperty('--brand-primary-soft', `color-mix(in srgb, ${primary} 14%, transparent)`);
    target.style.setProperty('--brand-primary-hover', `color-mix(in srgb, ${primary} 85%, white)`);
    target.style.setProperty('--brand-secondary-soft', `color-mix(in srgb, ${secondary} 14%, transparent)`);
  }
}

// Reads the brand color tokens currently painted at :root (i.e. _tokens.scss's defaults, which
// mirror DESIGN.md, until/unless ThemeService.apply() has overridden them with saved company
// branding). Used wherever code needs a color value with no hardcoded hex fallback of its own.
export function currentBrandPrimary(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim();
}

export function currentBrandSecondary(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim();
}
