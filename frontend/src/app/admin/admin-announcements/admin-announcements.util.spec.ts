import { bodyNeedsToggle, classifyPublishError, publishPayload, validateDraft } from './admin-announcements.util';

describe('admin-announcements.util', () => {
  it('accepts a valid draft and exactly 300 characters', () => {
    expect(validateDraft('Hello', 'World')).toBeNull();
    expect(validateDraft('x'.repeat(300), 'b')).toBeNull();
  });
  it('treats whitespace-only title or body as blank, both reported in one pass', () => {
    expect(validateDraft('   ', '\n\t ')).toEqual({ title: 'required', body: 'required', over: 0 });
  });
  it('flags 301+ characters with how many to cut, using the raw length the counter shows', () => {
    expect(validateDraft('x'.repeat(305), 'b')).toEqual({ title: 'tooLong', over: 5 });
  });
  it('blank wins over too-long only for the title field it applies to', () => {
    expect(validateDraft('x'.repeat(301), '')).toEqual({ title: 'tooLong', body: 'required', over: 1 });
  });
  it('trims the payload but keeps interior line breaks', () => {
    expect(publishPayload('  T  ', '\n line1\n\nline2 \n')).toEqual({ title: 'T', body: 'line1\n\nline2' });
  });
  it('classifies errors: 0 network, 400 validation with fields, others generic', () => {
    expect(classifyPublishError({ status: 0 })).toEqual({ kind: 'network' });
    expect(classifyPublishError({ status: 500 })).toEqual({ kind: 'generic' });
    expect(classifyPublishError({ status: 403 })).toEqual({ kind: 'generic' });
    expect(classifyPublishError({ status: 400, error: { fields: { title: 'size must be between 0 and 300' } } }))
      .toEqual({ kind: 'validation', fields: { title: 'size must be between 0 and 300', body: undefined } });
    expect(classifyPublishError({ status: 400, error: {} })).toEqual({ kind: 'validation', fields: undefined });
  });
  it('shows the toggle for multi-line or long-ish bodies and not for short ones', () => {
    expect(bodyNeedsToggle('Short note')).toBeFalse();
    expect(bodyNeedsToggle('a\nb\nc')).toBeFalse();
    expect(bodyNeedsToggle('a\nb\nc\nd')).toBeTrue();
    expect(bodyNeedsToggle('x'.repeat(91))).toBeTrue();
  });
});
