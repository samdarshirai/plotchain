import { HttpErrorResponse } from '@angular/common/http';

export interface ApiError {
  error: string;
  fields?: Record<string, string>;
}

// Extracts the per-field validation messages ApiExceptionHandler returns, tolerating any
// response that isn't shaped this way (a 500, an HTML error page from a proxy, a network
// failure with no body) so callers never have to null-check before reading a field's message.
export function toFieldErrors(err: HttpErrorResponse): Record<string, string> {
  const body: unknown = err.error;
  if (
    body &&
    typeof body === 'object' &&
    'fields' in body &&
    typeof (body as ApiError).fields === 'object' &&
    (body as ApiError).fields !== null
  ) {
    return (body as ApiError).fields!;
  }
  return {};
}
