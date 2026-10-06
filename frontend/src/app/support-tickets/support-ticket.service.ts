import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateSupportTicketRequest, RespondToSupportTicketRequest, SupportTicket, SupportTicketPage, SupportTicketStatus, TicketFilters
} from './support-ticket.model';

@Injectable({ providedIn: 'root' })
export class SupportTicketService {
  private http = inject(HttpClient);

  list(f: TicketFilters, page: number, size: number): Observable<SupportTicketPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (f.status) { params = params.set('status', f.status); }
    if (f.associateId) { params = params.set('associateId', f.associateId); }
    return this.http.get<SupportTicketPage>('/api/admin/support-tickets', { params });
  }

  create(req: CreateSupportTicketRequest): Observable<SupportTicket> {
    return this.http.post<SupportTicket>('/api/admin/support-tickets', req);
  }

  respond(id: string, req: RespondToSupportTicketRequest): Observable<SupportTicket> {
    return this.http.post<SupportTicket>(`/api/admin/support-tickets/${id}/respond`, req);
  }

  listMine(status: SupportTicketStatus | '', page: number, size: number): Observable<SupportTicketPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) { params = params.set('status', status); }
    return this.http.get<SupportTicketPage>('/api/associates/me/support-tickets', { params });
  }
}
