import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Booking, EmiInstallment, PAYMENT_MODES, PaymentMode } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingsEmiService } from '../admin-bookings-emi/bookings-emi.service';
import { BookingPage, RegisterFilters } from '../admin-bookings-emi/bookings-emi.model';
import { collectPages, formatMoney, plotText, utcDate } from '../admin-bookings-emi/bookings-emi.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ExportColumn, copyTable, exportCsv, exportExcel, printTable } from '../../shared/utils/table-export.util';

const PAGE_SIZE = 20;
const round2 = (n: number): number => Math.round(n * 100) / 100;

@Component({
  selector: 'app-add-plot-emi',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./add-plot-emi.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.addPlotEmi.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.addPlotEmi.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = ''">{{ flash }}</app-inline-banner>

      <div class="add-plot-emi__filters">
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.project' | translate }}
          <select name="project" [ngModel]="projectId" (ngModelChange)="onProject($event)">
            <option value="">{{ 'admin.addPlotEmi.selectProject' | translate }}</option>
            <option *ngFor="let p of projects" [value]="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="add-plot-emi__field add-plot-emi__field--grow">{{ 'admin.addPlotEmi.searchLabel' | translate }}
          <input type="search" name="q" [disabled]="!projectId" [ngModel]="q" (ngModelChange)="onSearch($event)"
            [placeholder]="'admin.addPlotEmi.searchPlaceholder' | translate" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.from' | translate }}
          <input type="date" name="from" [disabled]="!projectId" [ngModel]="from" [attr.max]="to || null" (ngModelChange)="onDate('from', $event)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.to' | translate }}
          <input type="date" name="to" [disabled]="!projectId" [ngModel]="to" [attr.min]="from || null" (ngModelChange)="onDate('to', $event)" />
        </label>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="!projectId" (click)="reset()">{{ 'admin.addPlotEmi.reset' | translate }}</button>
      </div>
      <app-field-error [message]="rangeError ? ('admin.addPlotEmi.rangeError' | translate) : undefined"></app-field-error>

      <div class="add-plot-emi__exports" *ngIf="projectId">
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busyExport" (click)="export('copy')">{{ 'admin.addPlotEmi.copy' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busyExport" (click)="export('csv')">{{ 'admin.addPlotEmi.csv' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="busyExport" (click)="export('excel')">{{ 'admin.addPlotEmi.excel' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="!page?.bookings?.length" (click)="print()">{{ 'admin.addPlotEmi.pdf' | translate }}</button>
      </div>
      <app-inline-banner *ngIf="exportError" tone="danger">{{ 'admin.addPlotEmi.exportError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <p class="add-plot-emi__hint" *ngIf="!projectId">{{ 'admin.addPlotEmi.pickProject' | translate }}</p>

      <div class="add-plot-emi__list" *ngIf="projectId && page" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <table #tbl class="add-plot-emi__table" [attr.aria-label]="'admin.addPlotEmi.title' | translate" *ngIf="page.bookings.length">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.associateId' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.mobile' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.project' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.plot' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.plotType' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.area' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.price' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.total' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.discount' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.paid' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.remaining' | translate }}</th>
                <th scope="col" class="add-plot-emi__noprint">{{ 'admin.addPlotEmi.col.action' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page.bookings">
                <td [attr.data-label]="'admin.addPlotEmi.col.bookedOn' | translate">{{ b.bookedAt ? b.bookedAt.slice(0, 10) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ b.associateCode || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ b.associateName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.mobile' | translate">{{ b.associatePhone || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.project' | translate">{{ b.projectName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plot' | translate">{{ plot(b) }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plotType' | translate">{{ b.plotType ? ('admin.projectsPlots.type.' + b.plotType | translate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ b.areaSqft != null ? b.areaSqft : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.price' | translate">{{ b.listPrice != null ? money(b.listPrice) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.discount' | translate">{{ b.discount != null ? money(b.discount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.paid' | translate">{{ money(b.paidAmount) }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.remaining' | translate">{{ money(b.dueAmount) }}</td>
                <td class="add-plot-emi__actions add-plot-emi__noprint">
                  <button type="button" class="brand-button add-plot-emi__btn" (click)="openPay(b)">{{ 'admin.addPlotEmi.addPayment' | translate }}</button>
                  <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" (click)="historyOf = b">{{ 'admin.addPlotEmi.history' | translate }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="add-plot-emi__hint" *ngIf="!page.bookings.length">{{ 'admin.addPlotEmi.empty' | translate }}</p>
        <div class="add-plot-emi__pager" *ngIf="page.bookings.length">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="page.page === 0" (click)="goTo(page.page - 1)">{{ 'admin.addPlotEmi.previous' | translate }}</button>
          <span>{{ 'admin.addPlotEmi.pager' | translate: { page: page.page + 1, totalPages: totalPages, count: page.totalElements } }}</span>
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="page.page + 1 >= totalPages" (click)="goTo(page.page + 1)">{{ 'admin.addPlotEmi.next' | translate }}</button>
        </div>
      </div>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="payFor as b" (keydown.escape)="closePay()">
      <form class="add-plot-emi__modal" role="dialog" aria-modal="true" aria-labelledby="ape-pay-title" (ngSubmit)="submit()" novalidate>
        <h2 class="add-plot-emi__modal-title" id="ape-pay-title">{{ 'admin.addPlotEmi.payTitle' | translate }}</h2>
        <app-inline-banner *ngIf="formError" tone="danger">{{ formError }}</app-inline-banner>

        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.plotDetails' | translate }}</h3>
        <dl class="add-plot-emi__facts">
          <div><dt>{{ 'admin.addPlotEmi.col.plot' | translate }}</dt><dd>{{ plot(b) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.project' | translate }}</dt><dd>{{ b.projectName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.associate' | translate }}</dt><dd>{{ b.associateName || '—' }} ({{ b.associateCode || '—' }})</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.buyer' | translate }}</dt><dd>{{ b.buyerName }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plotType' | translate }}</dt><dd>{{ b.plotType ? ('admin.projectsPlots.type.' + b.plotType | translate) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.area' | translate }}</dt><dd>{{ b.areaSqft != null ? b.areaSqft : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.total' | translate }}</dt><dd>{{ money(b.totalAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.paidAmount' | translate }}</dt><dd>{{ money(b.paidAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.remainingAmount' | translate }}</dt><dd>{{ money(b.dueAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.pendingAmount' | translate }}</dt><dd>{{ money(pendingOf(b)) }}</dd></div>
        </dl>

        <div class="add-plot-emi__grid">
          <label>{{ 'admin.addPlotEmi.topUpAmount' | translate }}
            <input type="number" name="amount" inputmode="decimal" min="0" step="0.01" [(ngModel)]="amount" />
            <app-field-error [message]="tried && amountInvalid ? ('admin.addPlotEmi.err.amount' | translate) : undefined"></app-field-error>
          </label>
          <label>{{ 'admin.addPlotEmi.paymentMode' | translate }}
            <select name="mode" [(ngModel)]="mode">
              <option value="">{{ 'admin.addPlotEmi.selectMode' | translate }}</option>
              <option *ngFor="let m of modes" [value]="m">{{ 'admin.bookingsEmi.paymentMode.' + m | translate }}</option>
            </select>
            <app-field-error [message]="tried && !mode ? ('admin.addPlotEmi.err.mode' | translate) : undefined"></app-field-error>
          </label>
          <label>{{ 'admin.addPlotEmi.bankName' | translate }}
            <input type="text" name="bank" maxlength="100" [(ngModel)]="bankName" />
            <app-field-error [message]="tried && bankInvalid ? ('admin.addPlotEmi.err.bank' | translate) : undefined"></app-field-error>
          </label>
          <label>{{ 'admin.addPlotEmi.txnNo' | translate }}
            <input type="text" name="txnNo" maxlength="100" [(ngModel)]="txnNo" />
            <app-field-error [message]="tried && !txnNo.trim() ? ('admin.addPlotEmi.err.txn' | translate) : undefined"></app-field-error>
          </label>
          <label>{{ 'admin.addPlotEmi.txnDate' | translate }}
            <input type="date" name="txnDate" [attr.max]="today" [(ngModel)]="txnDate" />
            <app-field-error [message]="tried && dateInvalid ? ('admin.addPlotEmi.err.date' | translate) : undefined"></app-field-error>
          </label>
        </div>

        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="saving" (click)="closePay()">{{ 'admin.addPlotEmi.cancel' | translate }}</button>
          <button type="submit" class="brand-button add-plot-emi__btn" [disabled]="saving">{{ (saving ? 'admin.addPlotEmi.saving' : 'admin.addPlotEmi.submit') | translate }}</button>
        </div>
      </form>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="historyOf as b" (keydown.escape)="historyOf = null">
      <div class="add-plot-emi__modal add-plot-emi__modal--wide" role="dialog" aria-modal="true" aria-labelledby="ape-hist-title">
        <h2 class="add-plot-emi__modal-title" id="ape-hist-title">{{ 'admin.addPlotEmi.historyTitle' | translate }} · {{ plot(b) }}</h2>
        <p class="add-plot-emi__hint" *ngIf="!history(b).length">{{ 'admin.addPlotEmi.hist.empty' | translate }}</p>
        <div class="add-plot-emi__scroll" *ngIf="history(b).length">
          <table class="add-plot-emi__table add-plot-emi__table--history">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.addPlotEmi.hist.date' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.amount' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.mode' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.bank' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.txn' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.status' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let i of history(b)">
                <td [attr.data-label]="'admin.addPlotEmi.hist.date' | translate">{{ i.paidAt ? i.paidAt.slice(0, 10) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.hist.amount' | translate">{{ money(i.amount) }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.mode' | translate">{{ i.paymentMode ? ('admin.bookingsEmi.paymentMode.' + i.paymentMode | translate) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.bank' | translate">{{ i.bankName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.txn' | translate">{{ i.paymentRef || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.status' | translate">{{ 'admin.bookingsEmi.installment.' + i.status | translate }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>{{ 'admin.addPlotEmi.hist.total' | translate }}</td>
                <td class="add-plot-emi__num">{{ money(historyTotal(b)) }}</td>
                <td colspan="4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" (click)="historyOf = null">{{ 'admin.addPlotEmi.close' | translate }}</button>
        </div>
      </div>
    </div>
  `
})
export class AddPlotEmiComponent implements OnInit, OnDestroy {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);
  private translate = inject(TranslateService);

  @ViewChild('tbl') tbl?: ElementRef<HTMLElement>;

  readonly modes = PAYMENT_MODES;
  readonly today = utcDate();
  money = formatMoney;
  plot = plotText;

  projects: Project[] = [];
  projectId = '';
  q = '';
  from = '';
  to = '';
  page: BookingPage | null = null;
  loading = false;
  loadError = false;
  rangeError = false;
  busyExport = false;
  exportError = false;
  flash = '';
  private seq = 0;
  private timer?: ReturnType<typeof setTimeout>;

  payFor: Booking | null = null;
  historyOf: Booking | null = null;
  amount: number | null = null;
  mode: PaymentMode | '' = '';
  bankName = '';
  txnNo = '';
  txnDate = '';
  tried = false;
  saving = false;
  formError = '';

  get totalPages(): number { return this.page ? Math.max(1, Math.ceil(this.page.totalElements / PAGE_SIZE)) : 1; }

  ngOnInit(): void {
    this.projectsService.listProjects().subscribe({ next: p => (this.projects = p), error: () => (this.loadError = true) });
  }

  ngOnDestroy(): void { clearTimeout(this.timer); }

  // pending EMI rows only: ENTERED money is already received, so it cannot be topped up again.
  pendingOf(b: Booking): number {
    return round2(b.installments.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0));
  }

  history(b: Booking): EmiInstallment[] {
    return b.installments.filter(i => (i.status === 'ENTERED' || i.status === 'PAID') && i.paidAt)
      .sort((a, c) => (c.paidAt ?? '').localeCompare(a.paidAt ?? ''));
  }

  historyTotal(b: Booking): number { return round2(this.history(b).reduce((s, i) => s + i.amount, 0)); }

  // ---- list -------------------------------------------------------------

  onProject(id: string): void {
    this.projectId = id;
    this.page = null;
    if (id) { this.load(0); }
  }

  onSearch(v: string): void {
    this.q = v;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(0), 300);
  }

  onDate(which: 'from' | 'to', v: string): void {
    this[which] = v;
    this.rangeError = !!this.from && !!this.to && this.from > this.to;
    if (!this.rangeError) { this.load(0); } // an inverted range keeps the last valid list
  }

  reset(): void {
    this.q = this.from = this.to = '';
    this.rangeError = false;
    this.load(0);
  }

  goTo(p: number): void { this.load(p); }

  private filters(): RegisterFilters {
    return { status: '', associateId: '', plotId: '', projectId: this.projectId, overdue: false,
      bookedFrom: this.from, bookedTo: this.to, q: this.q.trim(), hasPending: true };
  }

  load(page = this.page?.page ?? 0): void {
    if (!this.projectId) { return; }
    const seq = ++this.seq;
    this.loading = true;
    this.loadError = false;
    this.service.list(this.filters(), page, PAGE_SIZE).subscribe({
      next: r => { if (seq === this.seq) { this.page = r; this.loading = false; } },
      error: () => { if (seq === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  // ---- export -----------------------------------------------------------

  private columns(): ExportColumn<Booking>[] {
    const t = (k: string) => this.translate.instant('admin.addPlotEmi.col.' + k);
    return [
      { header: t('bookedOn'), value: b => b.bookedAt?.slice(0, 10) },
      { header: t('associateId'), value: b => b.associateCode },
      { header: t('associate'), value: b => b.associateName },
      { header: t('mobile'), value: b => b.associatePhone },
      { header: t('project'), value: b => b.projectName },
      { header: t('plot'), value: b => plotText(b) },
      { header: t('plotType'), value: b => b.plotType },
      { header: t('area'), value: b => b.areaSqft },
      { header: t('price'), value: b => b.listPrice },
      { header: t('total'), value: b => b.totalAmount },
      { header: t('discount'), value: b => b.discount },
      { header: t('paid'), value: b => b.paidAmount },
      { header: t('remaining'), value: b => b.dueAmount }
    ];
  }

  // Copy / CSV / Excel cover every page of the current filter, not just the visible one.
  export(kind: 'copy' | 'csv' | 'excel'): void {
    if (this.busyExport || !this.projectId) { return; }
    this.busyExport = true;
    this.exportError = false;
    const f = this.filters();
    collectPages<Booking>(p => this.service.list(f, p, 100).pipe(map(r => ({ rows: r.bookings, totalElements: r.totalElements })))).subscribe({
      next: rows => {
        const cols = this.columns();
        if (kind === 'csv') { exportCsv(rows, cols, 'add-plot-emi.csv'); this.busyExport = false; }
        else if (kind === 'excel') { exportExcel(rows, cols, 'add-plot-emi.xls'); this.busyExport = false; }
        else {
          copyTable(rows, cols).then(
            () => { this.busyExport = false; this.flash = this.translate.instant('admin.addPlotEmi.copied', { count: rows.length }); },
            () => { this.busyExport = false; this.exportError = true; });
        }
      },
      error: () => { this.busyExport = false; this.exportError = true; }
    });
  }

  // ponytail: PDF = the browser's print-to-PDF of the visible page; a full-set PDF needs a PDF lib.
  print(): void { if (this.tbl) { printTable(this.tbl.nativeElement); } }

  // ---- add payment ------------------------------------------------------

  openPay(b: Booking): void {
    this.payFor = b;
    this.amount = null;
    this.mode = '';
    this.bankName = '';
    this.txnNo = '';
    this.txnDate = this.today;
    this.tried = false;
    this.formError = '';
  }

  closePay(): void { if (!this.saving) { this.payFor = null; } }

  get amountInvalid(): boolean {
    const a = this.amount;
    return a == null || !(a > 0) || (!!this.payFor && round2(a) > this.pendingOf(this.payFor));
  }
  get bankInvalid(): boolean { return !!this.mode && this.mode !== 'CASH' && !this.bankName.trim(); }
  get dateInvalid(): boolean { return !this.txnDate || this.txnDate > this.today; }

  submit(): void {
    const b = this.payFor;
    if (!b || this.saving) { return; }
    this.tried = true;
    if (this.amountInvalid || !this.mode || this.bankInvalid || !this.txnNo.trim() || this.dateInvalid) { return; }
    this.saving = true;
    this.formError = '';
    const amount = round2(this.amount as number);
    this.service.topUp(b.id, {
      amount, paymentMode: this.mode, bankName: this.bankName.trim() || undefined,
      paymentRef: this.txnNo.trim(), paidAt: `${this.txnDate}T00:00:00Z`
    }).subscribe({
      next: () => {
        this.saving = false;
        this.payFor = null;
        this.flash = this.translate.instant('admin.addPlotEmi.success', { amount: formatMoney(amount), plot: plotText(b) });
        this.load();
      },
      error: err => {
        this.saving = false;
        if (err.status === 409) {
          this.formError = this.translate.instant('admin.addPlotEmi.err.notActive');
          this.load();
        } else {
          this.formError = err.error?.error ?? this.translate.instant('admin.addPlotEmi.err.server');
        }
      }
    });
  }
}
