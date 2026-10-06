import { RespondToSupportTicketRequest, SupportTicketStatus } from '../../support-tickets/support-ticket.model';

export interface FlashMessage { key: string; params?: Record<string, unknown>; }
export type TicketErrorKind = 'notFound' | 'validation' | 'network' | 'generic';

export const replyRequired = (s: SupportTicketStatus): boolean => s === 'RESOLVED' || s === 'CLOSED';

// Blank reply is omitted (not sent as ""), so a status-only change leaves the stored reply untouched (spec Flows).
export function respondPayload(status: SupportTicketStatus, reply: string): RespondToSupportTicketRequest {
  const r = reply.trim();
  return r ? { status, response: r } : { status };
}

export function snippet(text: string, max = 90): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function classifyTicketError(err: { status: number; error?: { error?: string } }): { kind: TicketErrorKind; serverText?: string } {
  const serverText = err.error?.error;
  if (err.status === 0) { return { kind: 'network', serverText }; }
  if (err.status === 404) { return { kind: 'notFound', serverText }; }
  if (err.status === 400) { return { kind: 'validation', serverText }; }
  return { kind: 'generic', serverText };
}
