import { Component, EventEmitter, ElementRef, OnInit, Output, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { SealCardComponent } from '../../shared/components/seal-card/seal-card.component';
import { FlashMessage, PaymentFilters, PaymentPage, PaymentRow } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { classifyError, formatMoney } from './bookings-emi.util';
import { ReportFiltersComponent, ReportFilterValue } from './report-filters.component';

const PAGE_SIZE = 20;
export const rowKey = (r: { bookingId: string; installmentNumber: number }): string => `${r.bookingId}#${r.installmentNumber}`;

@Component({
  selector: 'app-payment-queue',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./payment-queue.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent, SealCardComponent, ReportFiltersComponent],
  template: `
    <div class="payment-queue" [attr.aria-busy]="loading || busy">
      <app-report-filters [locked]="busy" (filtersChange)="onFilters($event)"></app-report-filters>

      <app-seal-card *ngIf="page && page.totalElements > 0" [label]="'admin.bookingsEmi.pendingTotal' | translate"
        [value]="money(page.grandTotal)" [caption]="((page.totalElements === 1 ? 'admin.bookingsEmi.queue.sealCaptionOne' : 'admin.bookingsEmi.queue.sealCaption') | translate: { count: page.totalElements }) + ' ' + ('admin.bookingsEmi.queue.note' | translate)"></app-seal-card>

      <app-inline-banner *ngIf="banner" [tone]="banner.tone" [dismissible]="true" (dismissed)="banner = null">
        <span [attr.role]="banner.tone === 'danger' ? 'alert' : 'status'">{{ banner.msg.key | translate: banner.msg.params }}</span>
        <div class="payment-queue__server" *ngIf="banner.serverText">{{ 'admin.bookingsEmi.err.serverSaid' | translate: { text: banner.serverText } }}</div>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadList' | translate }}
        <button type="button" class="booking-register__retry" [disabled]="busy" (click)="reload()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="payment-queue__bar" *ngIf="page?.payments?.length && !asking">
        <span class="payment-queue__bulk">
          <button type="button" class="brand-button brand-button--secondary payment-queue__check-all" [disabled]="busy" (click)="checkAll()">{{ 'admin.bookingsEmi.action.checkAll' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary payment-queue__uncheck-all" [disabled]="busy || !selected.size" (click)="uncheckAll()">{{ 'admin.bookingsEmi.action.uncheckAll' | translate }}</button>
        </span>
        <span class="payment-queue__selected" role="status">{{ 'admin.bookingsEmi.queue.selected' | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" #confirmBtn class="brand-button payment-queue__confirm" [disabled]="busy || !selected.size" (click)="ask()">{{ 'admin.bookingsEmi.action.confirmSelected' | translate }}</button>
      </div>
      <div class="payment-queue__prompt" role="alertdialog" aria-labelledby="payment-queue-prompt" *ngIf="asking">
        <span id="payment-queue-prompt">{{ (selected.size === 1 ? 'admin.bookingsEmi.queue.promptOne' : 'admin.bookingsEmi.queue.prompt') | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button payment-queue__yes" [disabled]="busy" [attr.aria-busy]="busy" (click)="doConfirm()">
          {{ (busy ? 'admin.bookingsEmi.action.confirming' : selected.size === 1 ? 'admin.bookingsEmi.queue.yesOne' : 'admin.bookingsEmi.queue.yes') | translate: { count: selected.size } }}</button>
        <button type="button" class="brand-button brand-button--secondary payment-queue__back" #backBtn [disabled]="busy" (click)="back()">{{ 'admin.bookingsEmi.action.back' | translate }}</button>
      </div>

      <div class="booking-register__list">
        <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
          <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
          <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3,4]"></span>
        </div>
        <table class="booking-register__table payment-queue__table" *ngIf="page" [attr.aria-label]="'admin.bookingsEmi.tab.unconfirmed' | translate">
          <thead><tr>
            <th scope="col" class="payment-queue__check">{{ 'admin.bookingsEmi.col.select' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.paymentDate' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.associateId' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.project' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.plot' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.mode' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.amount' | translate }}</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let r of page!.payments">
              <td class="payment-queue__check" [attr.data-label]="'admin.bookingsEmi.col.select' | translate">
                <input type="checkbox" [checked]="selected.has(key(r))" [disabled]="busy || loading" (change)="toggle(r)"
                  [attr.aria-label]="('admin.bookingsEmi.col.select' | translate) + ' ' + (r.associateCode || '') + ' ' + (r.plotNo || '') + ' #' + r.installmentNumber" /></td>
              <td [attr.data-label]="'admin.bookingsEmi.col.paymentDate' | translate">{{ r.paymentDate | date: 'mediumDate' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.associateId' | translate">{{ r.associateCode || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ r.associateName || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.project' | translate">{{ r.projectName || '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.plot' | translate">{{ r.plotNo || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.mode' | translate">{{ r.paymentMode ? ('admin.bookingsEmi.paymentMode.' + r.paymentMode | translate) : '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.amount' | translate">{{ money(r.amount) }}</td>
            </tr>
          </tbody>
          <tfoot><tr class="payment-queue__total">
            <td colspan="7">{{ 'admin.bookingsEmi.totalRow' | translate }}</td>
            <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.amount' | translate">{{ money(page!.pageTotal) }}</td>
          </tr></tfoot>
        </table>
        <div class="booking-register__empty" *ngIf="page && !page.payments.length">
          <h2>{{ 'admin.bookingsEmi.empty.queueTitle' | translate }}</h2>
          <p>{{ 'admin.bookingsEmi.empty.queueBody' | translate }}</p>
        </div>
        <app-pager [page]="page?.page ?? 0" [size]="PAGE_SIZE" [total]="page?.totalElements ?? 0" [disabled]="busy" (pageChange)="goTo($event)"></app-pager>
      </div>
    </div>
  `
})
export class PaymentQueueComponent implements OnInit {
  private service = inject(BookingsEmiService);
  @Output() changed = new EventEmitter<void>();
  readonly PAGE_SIZE = PAGE_SIZE;
  money = formatMoney; key = rowKey;
  page: PaymentPage | null = null;
  filters: PaymentFilters = {};
  loading = false; loadError = false; busy = false; asking = false;
  banner: { tone: 'success' | 'danger'; msg: FlashMessage; serverText?: string } | null = null;
  selected = new Set<string>();
  private refocusTrigger = false;
  // Focus follows the *ngIf'd buttons as they render: Back on open, the trigger on close.
  @ViewChild('backBtn') set backBtn(e: ElementRef<HTMLElement> | undefined) { e?.nativeElement.focus(); }
  @ViewChild('confirmBtn') set confirmBtn(e: ElementRef<HTMLElement> | undefined) {
    if (e && this.refocusTrigger) { this.refocusTrigger = false; e.nativeElement.focus(); }
  }
  private seq = 0; private currentPage = 0;

  ngOnInit(): void { this.load(0); }
  onFilters(f: ReportFilterValue): void { if (this.busy) { return; } this.filters = { from: f.from, to: f.to, projectId: f.projectId }; this.load(0); }
  goTo(p: number): void { if (!this.busy) { this.load(p); } }
  reload(): void { this.load(this.currentPage); }

  get selectedRows(): PaymentRow[] { return (this.page?.payments ?? []).filter(r => this.selected.has(rowKey(r))); }
  get selectedTotal(): number { return this.selectedRows.reduce((s, r) => s + r.amount, 0); }
  checkAll(): void { if (!this.busy) { (this.page?.payments ?? []).forEach(r => this.selected.add(rowKey(r))); } }
  uncheckAll(): void { if (!this.busy) { this.selected.clear(); this.asking = false; } }
  toggle(r: PaymentRow): void {
    if (this.busy) { return; }
    const k = rowKey(r);
    if (!this.selected.delete(k)) { this.selected.add(k); }
    if (!this.selected.size) { this.asking = false; }
  }
  back(): void { this.asking = false; this.refocusTrigger = true; }
  ask(): void { if (!this.busy && this.selected.size) { this.asking = true; } }

  doConfirm(): void {
    if (this.busy || !this.selected.size) { return; }
    const items = this.selectedRows.map(r => ({ bookingId: r.bookingId, installmentNumber: r.installmentNumber }));
    this.busy = true; this.banner = null;
    this.service.confirmPayments(items).subscribe({
      next: res => {
        // The response is ordered by bookingId, not request order: only count it, never zip it with the request.
        const auto = res.filter(b => b.status === 'CONFIRMED').length;
        this.busy = false;
        const one = items.length === 1 ? 'One' : 'Many';
        this.banner = { tone: 'success', msg: auto
          ? { key: `admin.bookingsEmi.ok.confirmed${one}Auto`, params: { count: items.length, auto } }
          : { key: `admin.bookingsEmi.ok.confirmed${one}`, params: { count: items.length } } };
        this.changed.emit();
        this.load(this.currentPage);
      },
      error: err => {
        const e = classifyError(err, 'confirmPayment');
        this.busy = false;
        this.banner = { tone: 'danger', msg: { key: 'admin.bookingsEmi.err.' + (e.kind === 'network' ? 'confirmManyNetwork' : 'confirmMany') }, serverText: e.serverText };
        this.load(this.currentPage); // stale rows are the usual cause; show the truth
      }
    });
  }

  // Latest-request-wins. Any (re)load clears the selection and the confirm prompt: a checked row must never outlive its page.
  private load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p; this.loading = true; this.loadError = false;
    this.selected.clear(); this.asking = false;
    this.service.payments('ENTERED', this.filters, p, PAGE_SIZE).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        // A bulk confirm can empty the last page: step back to the last page that still exists.
        if (!res.payments.length && res.totalElements > 0 && p > 0) { this.load(Math.min(p - 1, Math.ceil(res.totalElements / PAGE_SIZE) - 1)); return; }
        this.loading = false; this.page = res; this.selected.clear();
      },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
