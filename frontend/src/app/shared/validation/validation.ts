import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

// One entry per format rule: validator + "what is wrong and how to fix it".
// ponytail: English-only messages; move to translate keys if a second locale ships.
const RULES = {
  pan: { re: /^[A-Z]{5}[0-9]{4}[A-Z]$/, hint: 'Enter 10 characters in capitals: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)' },
  aadhaar: { re: /^[0-9]{12}$/, hint: 'Enter exactly 12 digits, no spaces' },
  phone: { re: /^[+]?[0-9]{10,15}$/, hint: 'Enter 10 to 15 digits, optional leading + (e.g. 9876543210)' },
  ifsc: { re: /^[A-Z]{4}0[A-Z0-9]{6}$/, hint: 'Enter 11 characters in capitals: 4 letters, 0, then 6 letters/digits (e.g. SBIN0001234)' },
  gstin: { re: /^[0-9A-Z]{15}$/, hint: 'Enter 15 characters, capital letters and digits only' },
  pincode: { re: /^[1-9][0-9]{5}$/, hint: 'Enter a 6-digit pincode that does not start with 0' },
  accountNumber: { re: /^[0-9]{9,18}$/, hint: 'Enter 9 to 18 digits, no spaces or dashes' },
  hexColor: { re: /^#[0-9A-Fa-f]{6}$/, hint: 'Enter a colour like #1A2B3C' },
  uuid: { re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, hint: 'Enter a valid ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)' }
} as const;

export type Rule = keyof typeof RULES;

/** Empty passes (pair with Validators.required for mandatory fields). */
export function format(rule: Rule): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null =>
    !c.value || RULES[rule].re.test(String(c.value)) ? null : { format: rule };
}

/** Positive money with at most 2 decimals. */
export const amount: ValidatorFn = c =>
  c.value === null || c.value === '' || (Number(c.value) > 0 && /^\d+(\.\d{1,2})?$/.test(String(c.value)))
    ? null : { amount: true };

export function matches(other: string): ValidatorFn {
  return c => (c.parent?.get(other)?.value === c.value ? null : { mismatch: true });
}

export function dateRange(from: string, to: string): ValidatorFn {
  return g => {
    const f = g.get(from)?.value, t = g.get(to)?.value;
    return f && t && f > t ? { dateRange: true } : null;
  };
}

export const required = Validators.required;

/** Problem + solution for the first error on a control, or undefined if valid. */
export function errorMessage(c: AbstractControl | null | undefined, label = 'This field'): string | undefined {
  const e = c?.errors;
  if (!e) return undefined;
  if (e['required']) return `${label} is required. Please fill it in.`;
  if (e['format']) return `${label} is not in the right format. ${RULES[e['format'] as Rule].hint}.`;
  if (e['email']) return `${label} is not a valid email. Use the form name@example.com.`;
  if (e['minlength']) return `${label} is too short. Use at least ${e['minlength'].requiredLength} characters.`;
  if (e['maxlength']) return `${label} is too long. Use at most ${e['maxlength'].requiredLength} characters.`;
  if (e['min']) return `${label} is too small. Enter ${e['min'].min} or more.`;
  if (e['max']) return `${label} is too large. Enter ${e['max'].max} or less.`;
  if (e['amount']) return `${label} must be greater than 0 with at most 2 decimal places (e.g. 1500.50).`;
  if (e['mismatch']) return `${label} does not match. Type the same value again.`;
  if (e['pattern']) return `${label} is not in the right format. Check the example and retype it.`;
  return `${label} is invalid. Please correct it.`;
}

export interface FormIssue { id: string; label: string; message: string }

/** All current errors in a reactive group. `labels` maps control name -> display label; only listed controls are checked. */
export function collectIssues(form: FormGroup, labels: Record<string, string>, server: Record<string, string> = {}): FormIssue[] {
  const out: FormIssue[] = [];
  for (const [name, label] of Object.entries(labels)) {
    const message = server[name] ?? errorMessage(form.get(name), label);
    if (message) out.push({ id: name, label, message });
  }
  return out;
}
