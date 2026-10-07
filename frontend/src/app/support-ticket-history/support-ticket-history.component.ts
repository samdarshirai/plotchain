import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupportTicketService } from '../support-tickets/support-ticket.service';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketPage, SupportTicketStatus } from '../support-tickets/support-ticket.model';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-support-ticket-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
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
        <table class="ticket-history__table" *ngIf="page.entries.length" [attr.aria-label]="'supportTickets.title' | translate">
          <thead>
            <tr>
              <th scope="col">{{ 'supportTickets.columnSubject' | translate }}</th>
              <th scope="col">{{ 'supportTickets.columnStatus' | translate }}</th>
              <th scope="col">{{ 'supportTickets.columnCreatedAt' | translate }}</th>
              <th scope="col">{{ 'supportTickets.columnResponse' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of page.entries; trackBy: trackById">
              <td><span class="ticket-history__subject">{{ t.subject }}</span><span class="ticket-history__description">{{ t.description }}</span></td>
              <td [attr.data-label]="'supportTickets.columnStatus' | translate">{{ 'supportTickets.status.' + t.status | translate }}</td>
              <td [attr.data-label]="'supportTickets.columnCreatedAt' | translate">{{ t.createdAt | date: 'medium' }}</td>
              <td [attr.data-label]="'supportTickets.columnResponse' | translate">
                <span class="ticket-history__reply" *ngIf="t.response?.trim(); else awaiting"><span class="ticket-history__reply-text">{{ t.response }}</span><span class="ticket-history__reply-stamp" *ngIf="t.respondedAt">{{ t.respondedAt | date: 'medium' }}</span></span>
                <ng-template #awaiting><span class="ticket-history__awaiting">{{ 'supportTickets.awaitingReply' | translate }}</span></ng-template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="ticket-history__pagination" *ngIf="page && !loadError">
        <span class="ticket-history__page-indicator">
          {{ 'supportTickets.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary ticket-history__prev" [attr.aria-disabled]="page.page === 0 ? 'true' : null" (click)="goToPage(page.page - 1)">
          {{ 'supportTickets.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary ticket-history__next" [attr.aria-disabled]="(page.page + 1) * page.size >= page.totalElements ? 'true' : null" (click)="goToPage(page.page + 1)">
          {{ 'supportTickets.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SupportTicketHistoryComponent implements OnInit, OnDestroy {
  private service = inject(SupportTicketService);
  private destroyed$ = new Subject<void>();
  private seq = 0; // latest-request-wins: a slow older response never overwrites a newer one
  private lastPage = 0; // last ATTEMPTED page, so Retry re-requests the page that failed

  readonly statuses = SUPPORT_TICKET_STATUSES;
  page: SupportTicketPage | null = null;
  loading = false;
  loadError = false;
  status: SupportTicketStatus | '' = '';

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  trackById = (_: number, t: SupportTicket) => t.id;

  ngOnInit(): void {
    this.loadPage(0);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  onStatusChange(value: string): void {
    this.status = value as SupportTicketStatus | '';
    this.loadPage(0);
  }

  goToPage(page: number): void {
    if (this.loading || page < 0 || (this.page && page * this.page.size >= Math.max(this.page.totalElements, 1))) {
      return; // aria-disabled buttons stay clickable (focus-safe), so enforce bounds and ignore clicks while a load is in flight
    }
    this.loadPage(page);
  }

  retry(): void {
    this.loadPage(this.lastPage);
  }

  private loadPage(page: number): void {
    const mine = ++this.seq;
    this.lastPage = page;
    this.loading = true;
    this.loadError = false;
    this.service.listMine(this.status, page, PAGE_SIZE).pipe(takeUntil(this.destroyed$)).subscribe({
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
