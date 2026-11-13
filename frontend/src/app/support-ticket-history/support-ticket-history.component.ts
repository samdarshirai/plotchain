import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupportTicketService } from '../support-tickets/support-ticket.service';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketPage, SupportTicketStatus } from '../support-tickets/support-ticket.model';
import { fetchAllPages } from '../shared/utils/fetch-all-pages';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { TableToolsComponent } from '../shared/components/table-tools/table-tools.component';

@Component({
  selector: 'app-support-ticket-history',
  standalone: true,
  imports: [TableToolsComponent, CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="ticket-history">
      <div class="ticket-history__intro">
        <span class="ticket-history__eyebrow">{{ 'supportTickets.eyebrow' | translate }}</span>
        <h1 class="ticket-history__title">{{ 'supportTickets.title' | translate }}</h1>
        <p class="ticket-history__subtitle">{{ 'supportTickets.subtitle' | translate }}</p>
      </div>

      <div class="ticket-history__filters">
        <div class="ticket-history__filter-field">
          <label>
            {{ 'supportTickets.statusFilterLabel' | translate }}
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'supportTickets.statusFilterAllOption' | translate }}</option>
              <option *ngFor="let s of statuses" [value]="s">{{ 'supportTickets.status.' + s | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="ticket-history__load-error">
        <span role="alert">{{ 'supportTickets.loadError' | translate }}</span>
        <button type="button" class="ticket-history__retry" (click)="retry()">{{ 'supportTickets.retryAction' | translate }}</button>
      </app-inline-banner>

      <div class="card" *ngIf="loading" [attr.aria-busy]="true">
        <div role="status">
          <span class="ticket-history__sr">{{ 'supportTickets.loading' | translate }}</span>
          <div class="ticket-history__skeleton-row" *ngFor="let _ of [1, 2, 3]"></div>
        </div>
      </div>

      <div class="card" *ngIf="!loading && !loadError && page">
        <p class="ticket-history__empty" *ngIf="!page.entries.length">
          {{ (status ? 'supportTickets.emptyStateFiltered' : 'supportTickets.emptyState') | translate }}
        </p>
        <app-table-tools filename="support-tickets"></app-table-tools>
        <table class="ticket-history__table" *ngIf="page.entries.length" [attr.aria-label]="'supportTickets.title' | translate">
          <thead>
            <tr>
              <th scope="col" class="table__sno">{{ 'common.serialNo' | translate }}</th>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">subject</span>{{ 'supportTickets.columnSubject' | translate }}</th>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'supportTickets.columnStatus' | translate }}</th>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'supportTickets.columnCreatedAt' | translate }}</th>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">chat</span>{{ 'supportTickets.columnResponse' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of page.entries; let i = index; trackBy: trackById" class="ticket-history__row--clickable" tabindex="0" role="button" [attr.aria-label]="('supportTickets.openDetails' | translate) + ': ' + t.subject" (click)="open(t)" (keydown.enter)="open(t)" (keydown.space)="$event.preventDefault(); open(t)">
              <td class="table__sno" [attr.data-label]="'common.serialNo' | translate">{{ i + 1 }}</td>
              <td><span class="ticket-history__subject">{{ t.subject }}</span><span class="ticket-history__description">{{ t.description }}</span></td>
              <td [attr.data-label]="'supportTickets.columnStatus' | translate">{{ 'supportTickets.status.' + t.status | translate }}</td>
              <td [attr.data-label]="'supportTickets.columnCreatedAt' | translate">{{ t.createdAt | date: 'd MMM y, h:mm:ss a' : '+0530' }}</td>
              <td [attr.data-label]="'supportTickets.columnResponse' | translate">
                <span class="ticket-history__reply" *ngIf="t.response?.trim(); else awaiting"><span class="ticket-history__reply-text">{{ t.response }}</span><span class="ticket-history__reply-stamp" *ngIf="t.respondedAt">{{ t.respondedAt | date: 'd MMM y, h:mm:ss a' : '+0530' }}</span></span>
                <ng-template #awaiting><span class="ticket-history__awaiting">{{ 'supportTickets.awaitingReply' | translate }}</span></ng-template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <dialog #dlg class="ticket-history__dialog" aria-labelledby="ticket-history-dialog-title" (close)="selected = null" (click)="onDialogClick($event)">
        <div class="ticket-history__dialog-body" *ngIf="selected as t">
          <h2 id="ticket-history-dialog-title" class="ticket-history__detail-subject">{{ t.subject }}</h2>
          <p class="ticket-history__detail-meta">
            {{ 'supportTickets.status.' + t.status | translate }} &middot; {{ 'supportTickets.detailsSent' | translate }} {{ t.createdAt | date: 'd MMM y, h:mm:ss a' : '+0530' }}
          </p>
          <h3 class="ticket-history__detail-heading">{{ 'supportTickets.detailsMessage' | translate }}</h3>
          <p class="ticket-history__detail-text">{{ t.description }}</p>
          <h3 class="ticket-history__detail-heading">{{ 'supportTickets.detailsReply' | translate }}</h3>
          <div class="ticket-history__reply" *ngIf="t.response?.trim(); else detailAwaiting">
            <p class="ticket-history__detail-text">{{ t.response }}</p>
            <span class="ticket-history__reply-stamp" *ngIf="t.respondedAt">{{ t.respondedAt | date: 'd MMM y, h:mm:ss a' : '+0530' }}</span>
          </div>
          <ng-template #detailAwaiting><span class="ticket-history__awaiting">{{ 'supportTickets.awaitingReply' | translate }}</span></ng-template>
          <button type="button" class="brand-button brand-button--secondary ticket-history__detail-close" (click)="closeDetails()">{{ 'supportTickets.detailsClose' | translate }}</button>
        </div>
      </dialog>
    </div>
  `
})
export class SupportTicketHistoryComponent implements OnInit, OnDestroy {
  private service = inject(SupportTicketService);
  private destroyed$ = new Subject<void>();
  private seq = 0; // latest-request-wins: a slow older response never overwrites a newer one

  readonly statuses = SUPPORT_TICKET_STATUSES;
  page: SupportTicketPage | null = null;
  loading = false;
  loadError = false;
  status: SupportTicketStatus | '' = '';

  @ViewChild('dlg', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  selected: SupportTicket | null = null;

  open(t: SupportTicket): void {
    this.selected = t;
    this.dialog.nativeElement.showModal();
  }

  closeDetails(): void {
    this.dialog.nativeElement.close();
    this.selected = null; // (close) also clears it for Esc, but that event is async
  }

  onDialogClick(e: MouseEvent): void {
    if (e.target === this.dialog.nativeElement) { this.closeDetails(); } // backdrop click
  }

  trackById = (_: number, t: SupportTicket) => t.id;

  ngOnInit(): void {
    this.loadPage();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onStatusChange(value: string): void {
    this.status = value as SupportTicketStatus | '';
    this.loadPage();
  }

  retry(): void {
    this.loadPage();
  }

  private loadPage(): void {
    const mine = ++this.seq;
    this.loading = true;
    this.loadError = false;
    fetchAllPages((p, size) => this.service.listMine(this.status, p, size)).pipe(takeUntil(this.destroyed$)).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.page = res;
        this.loading = false;
      },
      error: () => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.loadError = true;
      }
    });
  }
}
