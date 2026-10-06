import { classifyTicketError, replyRequired, respondPayload, snippet } from './admin-support-tickets.util';

describe('admin-support-tickets util', () => {
  it('requires a reply only for RESOLVED and CLOSED', () => {
    expect(replyRequired('RESOLVED')).toBeTrue();
    expect(replyRequired('CLOSED')).toBeTrue();
    expect(replyRequired('OPEN')).toBeFalse();
    expect(replyRequired('IN_PROGRESS')).toBeFalse();
  });

  it('respondPayload trims the reply and omits it when blank so an existing reply is kept', () => {
    expect(respondPayload('RESOLVED', '  Fixed  ')).toEqual({ status: 'RESOLVED', response: 'Fixed' });
    expect(respondPayload('IN_PROGRESS', '   ')).toEqual({ status: 'IN_PROGRESS' });
    expect('response' in respondPayload('OPEN', '')).toBeFalse();
  });

  it('snippet collapses whitespace and truncates with an ellipsis', () => {
    expect(snippet('a\n\n b')).toBe('a b');
    expect(snippet('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
    expect(snippet('short', 10)).toBe('short');
  });

  it('classifies errors', () => {
    expect(classifyTicketError({ status: 0 }).kind).toBe('network');
    expect(classifyTicketError({ status: 404 }).kind).toBe('notFound');
    expect(classifyTicketError({ status: 400, error: { error: 'Response is required' } })).toEqual({ kind: 'validation', serverText: 'Response is required' });
    expect(classifyTicketError({ status: 500 }).kind).toBe('generic');
  });
});
