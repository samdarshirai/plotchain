export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

// Mirrors backend SupportTicketResponse: one shape for admin queue rows and (unit 6) the associate's own history.
export interface SupportTicket {
  id: string;
  associateId: string;
  associateUserId: string;
  associateName: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketPage { entries: SupportTicket[]; page: number; size: number; totalElements: number; }
export interface CreateSupportTicketRequest { associateId: string; subject: string; description: string; }
export interface RespondToSupportTicketRequest { status: SupportTicketStatus; response?: string; }
export interface TicketFilters { status: SupportTicketStatus | ''; associateId: string; }
