import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketStatus } from '../../support-tickets/support-ticket.model';
import { SupportTicketService } from '../../support-tickets/support-ticket.service';
import { FlashMessage, TicketErrorKind, classifyTicketError, replyRequired, respondPayload } from './admin-support-tickets.util';

@Component({
  selector: 'app-ticket-seal',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./ticket-seal.component.scss'],
  imports: [CommonModule, TranslateModule, AssociateLookupComponent, InlineBannerComponent, FieldErrorComponent],
  template: `
    <section class="ticket-seal" aria-live="polite">
      <!-- RESPOND -->
      <ng-container *ngIf="mode === 'respond'">
        <p class="ticket-seal__none" *ngIf="!ticket">{{ 'admin.supportTickets.seal.none' | translate }}</p>
        <ng-container *ngIf="ticket as t">
          <h2 #title tabindex="-1" class="ticket-seal__title">{{ t.subject }}</h2>
          <div class="ticket-seal__sub">{{ t.associateName }} · <span class="ticket-seal__id">{{ t.associateUserId }}</span></div>
          <p class="ticket-seal__note" role="status" *ngIf="filterMismatch">{{ 'admin.supportTickets.seal.filterMismatch' | translate }}</p>
          <dl class="ticket-seal__meta">
            <dt>{{ 'admin.supportTickets.col.status' | translate }}</dt>
            <dd><span class="support-tickets__chip support-tickets__chip--{{ t.status | lowercase }}">{{ 'admin.supportTickets.status.' + t.status | translate }}</span></dd>
            <dt>{{ 'admin.supportTickets.seal.logged' | translate }}</dt><dd>{{ t.createdAt | date: 'mediumDate' }}</dd>
          </dl>
          <h3 class="ticket-seal__label">{{ 'admin.supportTickets.seal.description' | translate }}</h3>
          <p class="ticket-seal__text">{{ t.description }}</p>
          <ng-container *ngIf="t.response; else noReply">
            <h3 class="ticket-seal__label">{{ 'admin.supportTickets.seal.currentReply' | translate }}
              <span class="ticket-seal__replied" *ngIf="t.respondedAt">{{ 'admin.supportTickets.seal.repliedOn' | translate: { date: (t.respondedAt | date: 'mediumDate') } }}</span></h3>
            <blockquote class="ticket-seal__reply-quote">{{ t.response }}</blockquote>
          </ng-container>
          <ng-template #noReply><p class="ticket-seal__muted">{{ 'admin.supportTickets.seal.noReply' | translate }}</p></ng-template>

          <app-inline-banner *ngIf="error && error.kind !== 'validation'" tone="danger"><span role="alert">{{ errorKey | translate }}</span></app-inline-banner>
          <form class="ticket-seal__form" (submit)="submitRespond(); $event.preventDefault()" novalidate>
            <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.status' | translate }}
              <select name="status" [disabled]="busy" (change)="status = $any($event.target).value">
                <option *ngFor="let s of statuses" [value]="s" [selected]="status === s">{{ 'admin.supportTickets.status.' + s | translate }}</option>
              </select>
            </label>
            <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.reply' | translate }}
              <span class="ticket-seal__req" *ngIf="needsReply" aria-hidden="true">*</span>
              <textarea rows="4" name="reply" [class.ticket-seal__invalid]="replyInvalid" [attr.aria-invalid]="replyInvalid ? 'true' : null"
                [disabled]="busy" [value]="reply" (input)="reply = $any($event.target).value"></textarea>
            </label>
            <small class="ticket-seal__hint">{{ 'admin.supportTickets.seal.replyHint' | translate }}</small>
            <div role="alert">
              <app-field-error [message]="replyInvalid ? ('admin.supportTickets.err.replyRequired' | translate) : undefined"></app-field-error>
              <div class="ticket-seal__server" *ngIf="error?.kind === 'validation' && error?.serverText">{{ error?.serverText }}</div>
            </div>
            <div class="ticket-seal__form-actions">
              <button type="submit" class="brand-button ticket-seal__submit" [disabled]="busy" [attr.aria-busy]="busy">{{ (busy ? 'admin.supportTickets.action.saving' : 'admin.supportTickets.action.save') | translate }}</button>
            </div>
          </form>
        </ng-container>
      </ng-container>

      <!-- LOG -->
      <ng-container *ngIf="mode === 'log'">
        <h2 #title tabindex="-1" class="ticket-seal__title">{{ 'admin.supportTickets.seal.log' | translate }}</h2>
        <app-inline-banner *ngIf="error && error.kind !== 'notFound'" tone="danger"><span role="alert">{{ error.kind === 'validation' && error.serverText ? error.serverText : (errorKey | translate) }}</span></app-inline-banner>
        <form class="ticket-seal__form" (submit)="submitLog(); $event.preventDefault()" novalidate>
          <div class="ticket-seal__field">{{ 'admin.supportTickets.seal.associate' | translate }}
            <app-associate-lookup [associates]="directory" [value]="associateId" [placeholder]="'admin.supportTickets.filter.anyAssociate' | translate"
              (selected)="associateId = $event?.id ?? ''; error = null"></app-associate-lookup>
            <div class="ticket-seal__lookup-error" role="alert" *ngIf="error?.kind === 'notFound'">{{ 'admin.supportTickets.err.associateNotFound' | translate }}</div>
          </div>
          <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.subject' | translate }}
            <input type="text" name="subject" maxlength="200" [disabled]="busy" [value]="subject" (input)="subject = $any($event.target).value" />
          </label>
          <label class="ticket-seal__field">{{ 'admin.supportTickets.seal.descriptionField' | translate }}
            <textarea rows="5" name="description" [disabled]="busy" [value]="description" (input)="description = $any($event.target).value"></textarea>
          </label>
          <div role="alert"><app-field-error [message]="logInvalid ? ('admin.supportTickets.err.logRequired' | translate) : undefined"></app-field-error></div>
          <div class="ticket-seal__form-actions">
            <button type="submit" class="brand-button ticket-seal__submit" [disabled]="busy" [attr.aria-busy]="busy">{{ (busy ? 'admin.supportTickets.action.logging' : 'admin.supportTickets.action.log') | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary ticket-seal__cancel" [disabled]="busy" (click)="cancelLog.emit()">{{ 'admin.supportTickets.action.cancel' | translate }}</button>
          </div>
        </form>
      </ng-container>
    </section>
  `
})
export class TicketSealComponent implements OnChanges {
  private service = inject(SupportTicketService);
  private translate = inject(TranslateService);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);

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
  @ViewChild('title') title?: ElementRef<HTMLElement>;

  readonly statuses = SUPPORT_TICKET_STATUSES;
  status: SupportTicketStatus = 'OPEN';
  reply = '';
  tried = false;
  associateId = ''; subject = ''; description = ''; logTried = false;
  busy = false;
  error: { kind: TicketErrorKind; serverText?: string } | null = null;

  get needsReply(): boolean { return replyRequired(this.status); }
  // client check mirrors the 400 (Decision 4); a server 400 on respond shows the same message
  get replyInvalid(): boolean {
    return (this.tried && this.needsReply && !this.reply.trim()) || this.error?.kind === 'validation';
  }
  get logInvalid(): boolean {
    const s = this.subject.trim();
    return this.logTried && (!this.associateId || !s || s.length > 200 || !this.description.trim());
  }
  get errorKey(): string {
    const k = this.error?.kind;
    return 'admin.supportTickets.err.' + (k === 'notFound' ? 'ticketNotFound' : k === 'network' ? 'network' : 'generic');
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['ticket'] && ch['ticket'].previousValue?.id !== this.ticket?.id) {
      this.status = this.ticket?.status ?? 'OPEN';
      this.reply = '';
      this.tried = false;
      this.error = null;
      if (this.ticket) { this.focusTitle(); }
    }
    if (ch['mode'] && this.mode === 'log') {
      this.associateId = ''; this.subject = ''; this.description = ''; this.logTried = false; this.error = null; this.focusTitle();
    }
  }

  private focusTitle(): void {
    setTimeout(() => {
      this.title?.nativeElement.focus();
      if (window.innerWidth <= 960) { this.el.nativeElement.scrollIntoView?.({ block: 'start' }); }
    });
  }

  submitRespond(): void {
    if (this.busy || !this.ticket) { return; }
    this.tried = true;
    this.error = null;
    if (this.needsReply && !this.reply.trim()) { return; }
    const t = this.ticket;
    this.setBusy(true);
    this.service.respond(t.id, respondPayload(this.status, this.reply)).subscribe({
      next: res => {
        this.setBusy(false);
        this.reply = ''; this.tried = false;
        this.flash.emit({ key: 'admin.supportTickets.ok.responded', params: { subject: res.subject, status: this.translate.instant('admin.supportTickets.status.' + res.status) } });
        this.saved.emit(res);
      },
      error: (err: HttpErrorResponse) => {
        this.setBusy(false);
        this.error = classifyTicketError(err);
        if (this.error.kind === 'notFound') { this.reloadRequested.emit(); }
      }
    });
  }

  submitLog(): void {
    if (this.busy) { return; }
    this.logTried = true;
    this.error = null;
    if (this.logInvalid) { return; }
    this.setBusy(true);
    this.service.create({ associateId: this.associateId, subject: this.subject.trim(), description: this.description.trim() }).subscribe({
      next: res => {
        this.setBusy(false);
        this.logTried = false;
        this.flash.emit({ key: 'admin.supportTickets.ok.logged', params: { subject: res.subject, name: res.associateName, userId: res.associateUserId } });
        this.logged.emit(res);
      },
      error: (err: HttpErrorResponse) => { this.setBusy(false); this.error = classifyTicketError(err); }
    });
  }

  private setBusy(v: boolean): void { this.busy = v; this.busyChange.emit(v); }
}
