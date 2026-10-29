import { FormControl, FormGroup, Validators } from '@angular/forms';
import { amount, collectIssues, dateRange, errorMessage, format, matches } from './validation';

describe('validation', () => {
  it('format rules accept valid, reject invalid, ignore empty', () => {
    const ok = (r: any, v: string) => format(r)(new FormControl(v));
    expect(ok('pan', 'ABCDE1234F')).toBeNull();
    expect(ok('pan', 'abcde1234f')).toEqual({ format: 'pan' });
    expect(ok('ifsc', 'SBIN0001234')).toBeNull();
    expect(ok('ifsc', 'SBIN1001234')).toEqual({ format: 'ifsc' });
    expect(ok('pincode', '751001')).toBeNull();
    expect(ok('pincode', '051001')).toEqual({ format: 'pincode' });
    expect(ok('accountNumber', '12345678')).toEqual({ format: 'accountNumber' });
    expect(ok('phone', '')).toBeNull();
  });

  it('amount needs >0 and max 2 decimals', () => {
    expect(amount(new FormControl(10.5))).toBeNull();
    expect(amount(new FormControl(0))).toEqual({ amount: true });
    expect(amount(new FormControl(1.234))).toEqual({ amount: true });
  });

  it('messages carry problem and fix', () => {
    const c = new FormControl('x', format('ifsc'));
    expect(errorMessage(c, 'IFSC')).toContain('SBIN0001234');
    expect(errorMessage(new FormControl('', Validators.required), 'Name')).toBe('Name is required. Please fill it in.');
    expect(errorMessage(new FormControl('ok'))).toBeUndefined();
  });

  it('collectIssues lists every bad field, server errors win', () => {
    const f = new FormGroup({
      name: new FormControl('', Validators.required),
      pan: new FormControl('bad', format('pan')),
      phone: new FormControl('9876543210', format('phone'))
    });
    const issues = collectIssues(f, { name: 'Name', pan: 'PAN', phone: 'Phone' }, { phone: 'Already used' });
    expect(issues.map(i => i.id)).toEqual(['name', 'pan', 'phone']);
    expect(issues[2].message).toBe('Already used');
  });

  it('matches and dateRange', () => {
    const g = new FormGroup({ a: new FormControl('x'), b: new FormControl('y') });
    g.get('b')!.setValidators(matches('a'));
    g.get('b')!.updateValueAndValidity();
    expect(g.get('b')!.errors).toEqual({ mismatch: true });
    const d = new FormGroup({ f: new FormControl('2026-02-01'), t: new FormControl('2026-01-01') }, dateRange('f', 't'));
    expect(d.errors).toEqual({ dateRange: true });
  });
});
