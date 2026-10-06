import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { SupportTicket, SupportTicketStatus } from '../../support-tickets/support-ticket.model';
import { FlashMessage } from './admin-support-tickets.util';

// Compile stub; Tasks 5-6 fill it in.
@Component({
  selector: 'app-ticket-seal',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslateModule],
  template: `<section class="ticket-seal"><p>{{ 'admin.supportTickets.seal.none' | translate }}</p></section>`
})
export class TicketSealComponent {
  @Input() ticket: SupportTicket | null = null;
  @Input() mode: 'respond' | 'log' = 'respond';
  @Input() directory: AssociateSummary[] = [];
  @Input() filterMismatch = false;
  @Output() saved = new EventEmitter<SupportTicket>();
  @Output() logged = new EventEmitter<SupportTicket>();
  @Output() cancelLog = new EventEmitter<void>();
  @Output() flash = new EventEmitter<FlashMessage>();
  @Output() busyChange = new EventEmitter<boolean>();
  @Output() reloadRequested = new EventEmitter<void>();
  status: SupportTicketStatus = 'OPEN';
  reply = '';
  associateId = '';
  subject = '';
  description = '';
  submitRespond(): void { /* stub */ }
  submitLog(): void { /* stub */ }
}
