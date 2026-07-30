import { HttpErrorResponse } from '@angular/common/http';
import { toFieldErrors } from './field-errors.model';

describe('toFieldErrors', () => {
  it('extracts the fields map from an ApiExceptionHandler-shaped error body', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: { error: 'validation failed', fields: { contactEmail: 'must be a well-formed email address' } }
    });

    expect(toFieldErrors(err)).toEqual({ contactEmail: 'must be a well-formed email address' });
  });

  it('returns an empty object when the body has no fields key', () => {
    const err = new HttpErrorResponse({ status: 401, error: { error: 'invalid credentials' } });

    expect(toFieldErrors(err)).toEqual({});
  });

  it('returns an empty object when the body is not JSON (e.g. a proxy/HTML error page)', () => {
    const err = new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' });

    expect(toFieldErrors(err)).toEqual({});
  });

  it('returns an empty object when there is no body at all (network failure)', () => {
    const err = new HttpErrorResponse({ status: 0, error: null });

    expect(toFieldErrors(err)).toEqual({});
  });
});
