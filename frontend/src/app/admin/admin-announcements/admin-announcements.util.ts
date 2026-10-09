import { ANNOUNCEMENT_TITLE_MAX, CreateAnnouncementRequest } from '../../announcements/announcement.model';

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
export interface DraftErrors { title?: 'required' | 'tooLong'; body?: 'required'; over: number; }
export type PublishErrorKind = 'validation' | 'network' | 'generic';

// Mirrors @NotBlank + @Size(max = 300). The limit uses the RAW length (what the counter shows), even
// though the payload is trimmed: a title whose only excess is trailing spaces is rejected, which
// keeps the counter and the error from ever disagreeing.
export function validateDraft(title: string, body: string): DraftErrors | null {
  const errors: DraftErrors = { over: 0 };
  if (!title.trim()) { errors.title = 'required'; }
  else if (title.length > ANNOUNCEMENT_TITLE_MAX) { errors.title = 'tooLong'; errors.over = title.length - ANNOUNCEMENT_TITLE_MAX; }
  if (!body.trim()) { errors.body = 'required'; }
  return errors.title || errors.body ? errors : null;
}

export function publishPayload(title: string, body: string): CreateAnnouncementRequest {
  return { title: title.trim(), body: body.trim() };
}

// 400 body shape (ApiExceptionHandler): { error: 'validation failed', fields: { title?: string, body?: string } }
export function classifyPublishError(err: { status: number; error?: { fields?: Record<string, string> } }): { kind: PublishErrorKind; fields?: { title?: string; body?: string } } {
  if (err.status === 0) { return { kind: 'network' }; }
  if (err.status === 400) {
    const f = err.error?.fields;
    return { kind: 'validation', fields: f ? { title: f['title'], body: f['body'] } : undefined };
  }
  return { kind: 'generic' };
}

// ponytail: length/line heuristic instead of measuring rendered overflow. Errs toward showing the
// toggle (harmless if the text actually fits) so clamped text can never be left without a way to expand.
// Ceiling: a very narrow viewport with a < 91-char, <= 3-line body that still wraps past 3 lines; upgrade
// to a ResizeObserver scrollHeight > clientHeight check if that ever shows up.
export function bodyNeedsToggle(body: string): boolean {
  return body.length > 90 || body.split('\n').length > 3;
}
