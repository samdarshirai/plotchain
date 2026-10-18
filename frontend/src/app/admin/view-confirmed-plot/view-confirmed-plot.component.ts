import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { BookingsEmiService } from '../admin-bookings-emi/bookings-emi.service';
import { FlashMessage, PaymentPage, PaymentRow } from '../admin-bookings-emi/bookings-emi.model';
import { formatMoney } from '../admin-bookings-emi/bookings-emi.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

const PAGE_SIZE = 20;
type Status = 'ENTERED' | 'PAID';
const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const keyOf = (r: PaymentRow): string => `${r.bookingId}#${r.installmentNumber}`;

@Component({
  selector: 'app-view-confirmed-plot',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../add-plot-emi/add-plot-emi.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.viewConfirmedPlot.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.viewConfirmedPlot.subtitle' | translate }}</p>
      </div>

      <div class="add-plot-emi__filters">
        <label class="add-plot-emi__field">{{ 'admin.viewConfirmedPlot.from' | translate }}
          <input type="date" name="from" [value]="from" [attr.max]="to || null" (change)="onDate('from', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.viewConfirmedPlot.to' | translate }}
          <input type="date" name="to" [value]="to" [attr.min]="from || null" (change)="onDate('to', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.project' | translate }}
          <select name="project" (change)="onProject($any($event.target).value)">
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === projectId">{{ p.name }}</option>
          </select>
        </label>
      </div>
      <app-field-error [message]="rangeError ? ('admin.addPlotEmi.rangeError' | translate) : undefined"></app-field-error>

      <div class="add-plot-emi__filters" role="group">
        <button type="button" class="brand-button add-plot-emi__btn" [class.brand-button--secondary]="status !== 'ENTERED'"
          [attr.aria-pressed]="status === 'ENTERED'" [disabled]="busy" (click)="setStatus('ENTERED')">{{ 'admin.viewConfirmedPlot.pending' | translate }}</button>
        <button type="button" class="brand-button add-plot-emi__btn" [class.brand-button--secondary]="status !== 'PAID'"
          [attr.aria-pressed]="status === 'PAID'" [disabled]="busy" (click)="setStatus('PAID')">{{ 'admin.viewConfirmedPlot.confirmed' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="banner" [tone]="banner.tone" [dismissible]="true" (dismissed)="banner = null">
        <span [attr.role]="banner.tone === 'danger' ? 'alert' : 'status'">{{ banner.msg.key | translate: banner.msg.params }}</span>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__filters" *ngIf="status === 'ENTERED' && page?.payments?.length">
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="checkAll()">{{ 'admin.bookingsEmi.action.checkAll' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy || !selected.size" (click)="selected.clear()">{{ 'admin.bookingsEmi.action.uncheckAll' | translate }}</button>
        <span role="status">{{ 'admin.bookingsEmi.queue.selected' | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button add-plot-emi__btn" [disabled]="busy || !selected.size" (click)="asking = true">{{ 'admin.bookingsEmi.action.confirmSelected' | translate }}</button>
      </div>
      <div class="add-plot-emi__filters" role="alertdialog" *ngIf="asking">
        <span>{{ (selected.size === 1 ? 'admin.bookingsEmi.queue.promptOne' : 'admin.bookingsEmi.queue.prompt') | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button add-plot-emi__btn" [disabled]="busy" (click)="confirm()">
          {{ (busy ? 'admin.bookingsEmi.action.confirming' : selected.size === 1 ? 'admin.bookingsEmi.queue.yesOne' : 'admin.bookingsEmi.queue.yes') | translate: { count: selected.size } }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy" (click)="asking = false">{{ 'admin.bookingsEmi.action.back' | translate }}</button>
      </div>

      <div class="add-plot-emi__list" *ngIf="page" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <table class="add-plot-emi__table" [attr.aria-label]="'admin.viewConfirmedPlot.title' | translate" *ngIf="page.payments.length">
            <thead>
              <tr>
                <th scope="col" *ngIf="status === 'ENTERED'"><span class="material-symbols-outlined th-icon" aria-hidden="true">check_box</span>{{ 'admin.viewConfirmedPlot.col.select' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">tag</span>{{ 'admin.viewBookedPlot.col.sNo' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.viewConfirmedPlot.col.paymentDate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">badge</span>{{ 'admin.addPlotEmi.col.associateId' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">groups</span>{{ 'admin.addPlotEmi.col.associate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">call</span>{{ 'admin.addPlotEmi.col.mobile' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">apartment</span>{{ 'admin.addPlotEmi.col.project' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">landscape</span>{{ 'admin.addPlotEmi.col.plot' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">category</span>{{ 'admin.addPlotEmi.col.plotType' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">square_foot</span>{{ 'admin.addPlotEmi.col.area' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">sell</span>{{ 'admin.viewBookedPlot.col.rate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.viewBookedPlot.col.extra' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">percent</span>{{ 'admin.addPlotEmi.col.discount' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.addPlotEmi.col.total' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.addPlotEmi.col.paid' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">account_balance_wallet</span>{{ 'admin.addPlotEmi.col.remaining' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.viewConfirmedPlot.col.amount' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">credit_card</span>{{ 'admin.viewConfirmedPlot.col.mode' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'admin.viewConfirmedPlot.col.status' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of page.payments; let i = index">
                <td *ngIf="status === 'ENTERED'" [attr.data-label]="'admin.viewConfirmedPlot.col.select' | translate">
                  <input type="checkbox" [checked]="selected.has(key(r))" [disabled]="busy || loading" (change)="toggle(r)"
                    [attr.aria-label]="('admin.viewConfirmedPlot.col.select' | translate) + ' ' + (r.associateCode || '') + ' ' + (r.plotNo || '') + ' #' + r.installmentNumber" />
                </td>
                <td [attr.data-label]="'admin.viewBookedPlot.col.sNo' | translate">{{ page.page * pageSize + i + 1 }}</td>
                <td [attr.data-label]="'admin.viewConfirmedPlot.col.paymentDate' | translate">{{ r.paymentDate ? r.paymentDate.slice(0, 10) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.bookedOn' | translate">{{ r.bookedAt ? r.bookedAt.slice(0, 10) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ r.associateCode || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ r.associateName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.mobile' | translate">{{ r.associatePhone || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.project' | translate">{{ r.projectName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plot' | translate">{{ r.plotNo || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plotType' | translate">{{ r.plotType ? ('admin.projectsPlots.type.' + r.plotType | translate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ r.areaSqft != null ? r.areaSqft : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.rate' | translate">{{ r.rate != null ? money(r.rate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.extra' | translate">{{ r.extraPrice != null ? money(r.extraPrice) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.discount' | translate">{{ r.discount != null ? money(r.discount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.total' | translate">{{ r.totalAmount != null ? money(r.totalAmount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.paid' | translate">{{ r.paidAmount != null ? money(r.paidAmount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.remaining' | translate">{{ r.dueAmount != null ? money(r.dueAmount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewConfirmedPlot.col.amount' | translate">{{ money(r.amount) }}</td>
                <td [attr.data-label]="'admin.viewConfirmedPlot.col.mode' | translate">{{ r.paymentMode ? ('admin.bookingsEmi.paymentMode.' + r.paymentMode | translate) : '—' }}</td>
                <td [attr.data-label]="'admin.viewConfirmedPlot.col.status' | translate">{{ (status === 'ENTERED' ? 'admin.viewConfirmedPlot.pending' : 'admin.viewConfirmedPlot.confirmed') | translate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="add-plot-emi__hint" *ngIf="!page.payments.length">{{ (status === 'ENTERED' ? 'admin.viewConfirmedPlot.emptyPending' : 'admin.viewConfirmedPlot.emptyConfirmed') | translate }}</p>
        <div class="add-plot-emi__pager" *ngIf="page.payments.length">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy || page.page === 0" (click)="load(page.page - 1)">{{ 'admin.addPlotEmi.previous' | translate }}</button>
          <span>{{ 'admin.addPlotEmi.pager' | translate: { page: page.page + 1, totalPages: totalPages, count: page.totalElements } }}</span>
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busy || page.page + 1 >= totalPages" (click)="load(page.page + 1)">{{ 'admin.addPlotEmi.next' | translate }}</button>
        </div>
      </div>
    </div>
  `
})
export class ViewConfirmedPlotComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);

  readonly pageSize = PAGE_SIZE;
  money = formatMoney;
  key = keyOf;

  projects: Project[] = [];
  projectId = '';
  from = isoDate(new Date(Date.now() - 30 * 864e5));
  to = isoDate(new Date());
  status: Status = 'ENTERED';
  page: PaymentPage | null = null;
  selected = new Set<string>();
  loading = false;
  loadError = false;
  rangeError = false;
  busy = false;
  asking = false;
  banner: { tone: 'success' | 'danger'; msg: FlashMessage } | null = null;
  private seq = 0;

  get totalPages(): number { return this.page ? Math.max(1, Math.ceil(this.page.totalElements / PAGE_SIZE)) : 1; }
  get selectedRows(): PaymentRow[] { return (this.page?.payments ?? []).filter(r => this.selected.has(keyOf(r))); }
  get selectedTotal(): number { return this.selectedRows.reduce((s, r) => s + r.amount, 0); }

  ngOnInit(): void {
    this.projectsService.listProjects().subscribe({
      next: p => { this.projects = p; this.projectId = p[0]?.id ?? ''; this.load(0); },
      error: () => (this.loadError = true)
    });
  }

  onProject(id: string): void { this.projectId = id; this.load(0); }

  onDate(which: 'from' | 'to', v: string): void {
    this[which] = v;
    this.rangeError = !!this.from && !!this.to && this.from > this.to;
    if (!this.rangeError) { this.load(0); } // an inverted range keeps the last valid list
  }

  setStatus(s: Status): void {
    if (this.busy || s === this.status) { return; }
    this.status = s;
    this.banner = null;
    this.load(0);
  }

  toggle(r: PaymentRow): void {
    const k = keyOf(r);
    if (!this.selected.delete(k)) { this.selected.add(k); }
    if (!this.selected.size) { this.asking = false; }
  }

  checkAll(): void { (this.page?.payments ?? []).forEach(r => this.selected.add(keyOf(r))); }

  confirm(): void {
    if (this.busy || !this.selected.size) { return; }
    const items = this.selectedRows.map(r => ({ bookingId: r.bookingId, installmentNumber: r.installmentNumber }));
    this.busy = true;
    this.banner = null;
    this.service.confirmPayments(items).subscribe({
      next: res => {
        const auto = res.filter(b => b.status === 'CONFIRMED').length;
        const one = items.length === 1 ? 'One' : 'Many';
        this.busy = false;
        this.banner = { tone: 'success', msg: auto
          ? { key: `admin.bookingsEmi.ok.confirmed${one}Auto`, params: { count: items.length, auto } }
          : { key: `admin.bookingsEmi.ok.confirmed${one}`, params: { count: items.length } } };
        this.load(this.page?.page ?? 0);
      },
      error: err => {
        this.busy = false;
        this.banner = { tone: 'danger', msg: { key: 'admin.bookingsEmi.err.' + (err.status === 0 ? 'confirmManyNetwork' : 'confirmMany') } };
        this.load(this.page?.page ?? 0); // stale rows are the usual cause; show the truth
      }
    });
  }

  load(p = this.page?.page ?? 0): void {
    if (!this.projectId) { return; }
    const seq = ++this.seq;
    this.loading = true;
    this.loadError = false;
    this.selected.clear();
    this.asking = false;
    this.service.payments(this.status, { from: this.from, to: this.to, projectId: this.projectId }, p, PAGE_SIZE).subscribe({
      next: r => {
        if (seq !== this.seq) { return; }
        // A bulk confirm can empty the last page: step back to one that still exists.
        if (!r.payments.length && r.totalElements > 0 && p > 0) { this.load(Math.ceil(r.totalElements / PAGE_SIZE) - 1); return; }
        this.page = r;
        this.loading = false;
      },
      error: () => { if (seq === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
