import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { SUPPORT_TICKET_STATUSES, SupportTicket, SupportTicketPage, TicketFilters } from '../../support-tickets/support-ticket.model';
import { SupportTicketService } from '../../support-tickets/support-ticket.service';
import { FlashMessage, snippet } from './admin-support-tickets.util';
import { TicketSealComponent } from './ticket-seal.component';

const PAGE_SIZE = 20;
const NO_FILTERS: TicketFilters = { status: '', associateId: '' };

@Component({
  selector: 'app-admin-support-tickets',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./admin-support-tickets.component.scss', './admin-support-tickets-list.scss'],
  imports: [CommonModule, TranslateModule, AssociateLookupComponent, InlineBannerComponent, TicketSealComponent],
  template: `
    <div class="support-tickets">
      <div class="support-tickets__head">
        <div>
          <span class="support-tickets__eyebrow">{{ 'admin.supportTickets.eyebrow' | translate }}</span>
          <h1 class="support-tickets__title">{{ 'admin.supportTickets.title' | translate }}</h1>
          <p class="support-tickets__subtitle">{{ 'admin.supportTickets.subtitle' | translate }}</p>
        </div>
        <button type="button" class="brand-button support-tickets__log" [disabled]="locked" (click)="startLog()">{{ 'admin.supportTickets.logButton' | translate }}</button>
      </div>

      <div class="support-tickets__filters">
        <label class="support-tickets__field">{{ 'admin.supportTickets.filter.status' | translate }}
          <select class="support-tickets__status" [disabled]="locked" (change)="applyFilter({ status: $any($event.target).value })">
            <option value="" [selected]="!filters.status">{{ 'admin.supportTickets.filter.allStatuses' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s" [selected]="filters.status === s">{{ 'admin.supportTickets.status.' + s | translate }}</option>
          </select>
        </label>
        <div class="support-tickets__field" [class.support-tickets__field--locked]="locked" [attr.inert]="locked ? '' : null">{{ 'admin.supportTickets.filter.associate' | translate }}
          <app-associate-lookup [associates]="directory" [value]="filters.associateId"
            [placeholder]="'admin.supportTickets.filter.anyAssociate' | translate"
            (selected)="applyFilter({ associateId: $event?.id ?? '' })"></app-associate-lookup>
        </div>
        <button type="button" class="brand-button brand-button--secondary support-tickets__reset" [disabled]="locked" (click)="resetFilters()">{{ 'admin.supportTickets.filter.reset' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = null">
        <span role="status">{{ flash.key | translate: flash.params }}</span>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        <span role="alert">{{ 'admin.supportTickets.err.load' | translate }}</span>
        <button type="button" class="support-tickets__retry" [disabled]="locked" (click)="reload()">{{ 'admin.supportTickets.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="support-tickets__grid">
        <div class="support-tickets__list" [attr.aria-busy]="loading">
          <div class="support-tickets__skeleton" role="status" *ngIf="!page && !loadError">
            <span class="support-tickets__sr">{{ 'admin.supportTickets.loading' | translate }}</span>
            <span class="support-tickets__skeleton-row" *ngFor="let i of [1,2,3]"></span>
          </div>

          <div class="support-tickets__empty" *ngIf="page && !page.entries.length">
            <ng-container *ngIf="hasFilters; else firstRun">
              <h2>{{ 'admin.supportTickets.empty.noMatchTitle' | translate }}</h2>
              <button type="button" class="brand-button brand-button--secondary" [disabled]="locked" (click)="resetFilters()">{{ 'admin.supportTickets.filter.reset' | translate }}</button>
            </ng-container>
            <ng-template #firstRun>
              <h2>{{ 'admin.supportTickets.empty.noTicketsTitle' | translate }}</h2>
              <p>{{ 'admin.supportTickets.empty.noTicketsBody' | translate }}</p>
              <button type="button" class="brand-button" [disabled]="locked" (click)="startLog()">{{ 'admin.supportTickets.logButton' | translate }}</button>
            </ng-template>
          </div>

          <table class="support-tickets__table" *ngIf="page?.entries?.length" [attr.aria-label]="'admin.supportTickets.title' | translate">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.supportTickets.col.ticket' | translate }}</th>
                <th scope="col">{{ 'admin.supportTickets.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.supportTickets.col.status' | translate }}</th>
                <th scope="col">{{ 'admin.supportTickets.col.logged' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of page!.entries" class="support-tickets__row" tabindex="0"
                [class.support-tickets__row--selected]="t.id === selected?.id" [attr.aria-current]="t.id === selected?.id ? 'true' : null"
                (click)="selectTicket(t)" (keydown.enter)="selectTicket(t)" (keydown.space)="selectTicket(t); $event.preventDefault()">
                <td [attr.data-label]="'admin.supportTickets.col.ticket' | translate">
                  <strong>{{ t.subject }}</strong><br /><span class="support-tickets__sub">{{ snip(t.description) }}</span>
                </td>
                <td [attr.data-label]="'admin.supportTickets.col.associate' | translate">{{ t.associateName }}<br /><span class="support-tickets__id">{{ t.associateUserId }}</span></td>
                <td [attr.data-label]="'admin.supportTickets.col.status' | translate">
                  <span class="support-tickets__chip support-tickets__chip--{{ t.status | lowercase }}">{{ 'admin.supportTickets.status.' + t.status | translate }}</span>
                </td>
                <td class="support-tickets__date" [attr.data-label]="'admin.supportTickets.col.logged' | translate">{{ t.createdAt | date: 'mediumDate' }}</td>
              </tr>
            </tbody>
          </table>

          <div class="support-tickets__pager" *ngIf="page?.entries?.length">
            <button type="button" class="brand-button brand-button--secondary support-tickets__prev" [disabled]="locked || page!.page === 0" (click)="goTo(page!.page - 1)">{{ 'admin.supportTickets.previous' | translate }}</button>
            <span>{{ 'admin.supportTickets.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
            <button type="button" class="brand-button brand-button--secondary support-tickets__next" [disabled]="locked || page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">{{ 'admin.supportTickets.next' | translate }}</button>
          </div>
        </div>

        <app-ticket-seal [ticket]="selected" [mode]="sealMode" [directory]="directory" [filterMismatch]="filterMismatch"
          (saved)="onSaved($event)" (logged)="onLogged($event)" (cancelLog)="onCancelLog()"
          (flash)="flash = $event" (busyChange)="locked = $event" (reloadRequested)="reload()"></app-ticket-seal>
      </div>
    </div>
  `
})
export class AdminSupportTicketsComponent implements OnInit {
  private service = inject(SupportTicketService);
  private admin = inject(AdminService);

  readonly statuses = SUPPORT_TICKET_STATUSES;
  filters: TicketFilters = { ...NO_FILTERS };
  directory: AssociateSummary[] = [];
  page: SupportTicketPage | null = null;
  selected: SupportTicket | null = null;
  sealMode: 'respond' | 'log' = 'respond';
  filterMismatch = false;
  flash: FlashMessage | null = null;
  loadError = false;
  loading = false;
  locked = false; // true while a seal write is in flight: filters, pager, selection and Log freeze
  private seq = 0;
  private currentPage = 0;

  snip = (t: string) => snippet(t);
  get hasFilters(): boolean { return !!(this.filters.status || this.filters.associateId); }
  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.admin.listAssociates().subscribe({ next: d => (this.directory = d), error: () => undefined });
    this.reload();
  }

  applyFilter(partial: Partial<TicketFilters>): void {
    if (this.locked) { return; }
    this.filters = { ...this.filters, ...partial };
    this.filterMismatch = false;
    this.load(0, true);
  }

  resetFilters(): void {
    if (this.locked) { return; }
    this.filters = { ...NO_FILTERS };
    this.filterMismatch = false;
    this.load(0, true);
  }

  // re-requests the last attempted page and re-checks whether the selection still matches the filters
  reload(): void { this.load(this.currentPage, true); }
  goTo(p: number): void { if (!this.locked) { this.load(p); } }

  // Latest-request-wins: a slow earlier response can never overwrite a newer one.
  private load(p: number, checkMismatch = false): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.list(this.filters, p, PAGE_SIZE).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.page = res;
        if (this.selected) {
          const still = res.entries.find(t => t.id === this.selected!.id);
          if (still) { this.selected = still; this.filterMismatch = false; } else if (checkMismatch && this.hasFilters) { /* unfiltered, a missing ticket is just on another page */ this.filterMismatch = true; }
        }
      },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  selectTicket(t: SupportTicket): void {
    if (this.locked) { return; }
    this.selected = t;
    this.sealMode = 'respond';
    this.filterMismatch = false;
  }

  startLog(): void { if (!this.locked) { this.sealMode = 'log'; this.flash = null; } }
  onCancelLog(): void { this.sealMode = 'respond'; }

  // Respond finished: patch the row + selection immediately, then re-sync the page.
  onSaved(updated: SupportTicket): void {
    if (this.page) {
      this.page = { ...this.page, entries: this.page.entries.map(t => (t.id === updated.id ? updated : t)) };
    }
    if (this.selected?.id === updated.id) { this.selected = updated; } // a late write for A must not steal selection from B
    this.reload();
  }

  // Log finished: select the new ticket from the 201 body, reload page 0 (newest-first); the note shows if filters hide it.
  onLogged(created: SupportTicket): void {
    this.selected = created;
    this.sealMode = 'respond';
    this.load(0, true);
  }
}
