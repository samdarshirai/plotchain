import { formatIst } from '../../shared/utils/ist-date';
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Booking, EmiInstallment } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingsEmiService } from '../admin-bookings-emi/bookings-emi.service';
import { BookingPage, RegisterFilters } from '../admin-bookings-emi/bookings-emi.model';
import { formatMoney, plotText } from '../admin-bookings-emi/bookings-emi.util';
import { PAY_MODES, PayMode } from '../invoice/invoice.service';
import { formatArea } from '../../shared/utils/plot-grid.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { fetchAllPages } from '../../shared/utils/fetch-all-pages';
import { AssociateCycleFilterComponent } from '../../shared/components/associate-cycle-filter/associate-cycle-filter.component';

const round2 = (n: number): number => Math.round(n); // whole rupees
const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

@Component({
  selector: 'app-plot-cancel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../add-plot-emi/add-plot-emi.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent, AssociateCycleFilterComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.plotCancel.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.plotCancel.subtitle' | translate }}</p>
      </div>

      <div class="add-plot-emi__filters">
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.from' | translate }}
          <input type="date" name="from" [value]="from" [attr.max]="to || null" (change)="onDate('from', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.to' | translate }}
          <input type="date" name="to" [value]="to" [attr.min]="from || null" (change)="onDate('to', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.project' | translate }}
          <select name="project" (change)="onProject($any($event.target).value)">
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === projectId">{{ p.name }}</option>
          </select>
        </label>
        <label class="add-plot-emi__field">{{ 'admin.salesRegister.plotNoFilterLabel' | translate }}
          <input type="text" name="plotNo" [value]="plotNo" [placeholder]="'admin.emiReport.plotIdPlaceholder' | translate"
            (change)="onPlot($any($event.target).value)" />
        </label>
        <app-associate-cycle-filter [from]="from" [to]="to" [associateId]="associateId"
          (associateChange)="onAssociate($event)" (rangeChange)="onRange($event)"></app-associate-cycle-filter>
      </div>
      <app-field-error [message]="rangeError ? ('admin.addPlotEmi.rangeError' | translate) : undefined"></app-field-error>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = ''">{{ flash }}</app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__list" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <table class="add-plot-emi__table" [attr.aria-label]="'admin.plotCancel.title' | translate">
            <thead>
              <tr>
                <th scope="col" class="table__sno"><span class="material-symbols-outlined th-icon" aria-hidden="true">tag</span>{{ 'admin.viewBookedPlot.col.sNo' | translate }}</th>
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
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">more_horiz</span>{{ 'admin.plotCancel.col.actions' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page?.bookings; let i = index">
                <td class="table__sno" [attr.data-label]="'admin.viewBookedPlot.col.sNo' | translate">{{ i + 1 }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.bookedOn' | translate">{{ b.bookedAt ? (b.bookedAt | date: 'd MMM y, h:mm:ss a' : '+0530') : '—' }}</td>
                <td class="editable-table__cell--bold" [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ b.associateCode || '—' }}</td>
                <td class="editable-table__cell--bold" [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ b.associateName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.mobile' | translate">{{ b.associatePhone || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.project' | translate">{{ b.projectName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plot' | translate">{{ plot(b) }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plotType' | translate">{{ b.plotType ? ('admin.projectsPlots.type.' + b.plotType | translate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ b.areaSqft != null ? b.areaSqft : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.rate' | translate">{{ b.rate != null ? money(b.rate) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.extra' | translate">{{ b.extraPrice != null ? money(b.extraPrice) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.discount' | translate">{{ b.discount != null ? money(b.discount) : '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.paid' | translate">{{ money(b.paidAmount) }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.remaining' | translate">{{ money(b.dueAmount) }}</td>
                <td class="add-plot-emi__actions add-plot-emi__actions--compact">
                  <button type="button" class="brand-button add-plot-emi__btn" (click)="open(b)">{{ 'admin.viewBookedPlot.col.detail' | translate }}</button>
                  <button type="button" class="brand-button brand-button--danger add-plot-emi__btn" (click)="openCancel(b)">{{ 'admin.plotCancel.cancel' | translate }}</button>
                </td>
              </tr>
              <tr *ngIf="!page?.bookings?.length">
                <td class="add-plot-emi__empty-cell" [attr.colspan]="16">{{ 'admin.addPlotEmi.empty' | translate }}</td>
              </tr>
            </tbody>
          <tfoot *ngIf="page?.bookings?.length">
            <tr class="editable-table__total">
              <td>{{ 'common.total' | translate }}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ areaFmt(sumOf('areaSqft')) }}</td>
              <td></td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.extra' | translate">{{ money(sumOf('extraPrice')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.discount' | translate">{{ money(sumOf('discount')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.total' | translate">{{ money(sumOf('totalAmount')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.paid' | translate">{{ money(sumOf('paidAmount')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.remaining' | translate">{{ money(sumOf('dueAmount')) }}</td>
              <td></td>
            </tr>
          </tfoot>
          </table>
        </div>
      </div>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="detail as b" (keydown.escape)="detail = null" (click)="$event.target === $event.currentTarget && (detail = null)">
      <div class="add-plot-emi__modal add-plot-emi__modal--wide" role="dialog" aria-modal="true" aria-labelledby="vbp-title">
        <h2 class="add-plot-emi__modal-title" id="vbp-title">{{ 'admin.viewBookedPlot.detailTitle' | translate }} · {{ plot(b) }}</h2>
        <app-inline-banner *ngIf="detailError" tone="danger">{{ 'admin.addPlotEmi.loadError' | translate }}</app-inline-banner>

        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.plotDetails' | translate }}</h3>
        <dl class="add-plot-emi__facts">
          <div><dt>{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</dt><dd>{{ dateTime(b.bookedAt) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.project' | translate }}</dt><dd>{{ b.projectName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plot' | translate }}</dt><dd>{{ plot(b) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plotType' | translate }}</dt><dd>{{ b.plotType ? ('admin.projectsPlots.type.' + b.plotType | translate) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.area' | translate }}</dt><dd>{{ b.areaSqft != null ? b.areaSqft : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.associate' | translate }}</dt><dd>{{ b.associateName || '—' }} ({{ b.associateCode || '—' }})</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.mobile' | translate }}</dt><dd>{{ b.associatePhone || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.buyer' | translate }}</dt><dd>{{ b.buyerName || '—' }}</dd></div>
          <div><dt>{{ 'admin.viewBookedPlot.buyerPhone' | translate }}</dt><dd>{{ b.buyerPhone || '—' }}</dd></div>
          <div><dt>{{ 'admin.viewBookedPlot.col.rate' | translate }}</dt><dd>{{ b.rate != null ? money(b.rate) : '—' }}</dd></div>
          <div><dt>{{ 'admin.viewBookedPlot.col.extra' | translate }}</dt><dd>{{ b.extraPrice != null ? money(b.extraPrice) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.discount' | translate }}</dt><dd>{{ b.discount != null ? money(b.discount) : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.total' | translate }}</dt><dd>{{ money(b.totalAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.paidAmount' | translate }}</dt><dd>{{ money(b.paidAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.remainingAmount' | translate }}</dt><dd>{{ money(b.dueAmount) }}</dd></div>
        </dl>

        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.historyTitle' | translate }}</h3>
        <p class="add-plot-emi__hint" *ngIf="!history(b).length">{{ 'admin.addPlotEmi.hist.empty' | translate }}</p>
        <div class="add-plot-emi__scroll" *ngIf="history(b).length">
          <table class="add-plot-emi__table add-plot-emi__table--history">
            <thead>
              <tr>
                <th scope="col" class="table__sno"><span class="material-symbols-outlined th-icon" aria-hidden="true">tag</span>{{ 'admin.addPlotEmi.hist.sNo' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.addPlotEmi.hist.paymentDate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.addPlotEmi.hist.amount' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">credit_card</span>{{ 'admin.addPlotEmi.hist.mode' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">receipt_long</span>{{ 'admin.addPlotEmi.hist.txn' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.addPlotEmi.hist.txnDate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'admin.addPlotEmi.hist.status' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.addPlotEmi.hist.confirmedDate' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let i of history(b); let n = index">
                <td class="table__sno" [attr.data-label]="'admin.addPlotEmi.hist.sNo' | translate">{{ n + 1 }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.paymentDate' | translate">{{ dateTime(i.recordedAt) }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.hist.amount' | translate">{{ money(i.amount) }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.mode' | translate">{{ i.paymentMode ? ('admin.bookingsEmi.paymentMode.' + i.paymentMode | translate) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.txn' | translate">{{ i.paymentRef || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.txnDate' | translate">{{ i.paidAt ? i.paidAt.slice(0, 10) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.status' | translate">{{ 'admin.bookingsEmi.installment.' + i.status | translate }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.hist.confirmedDate' | translate">{{ dateTime(i.confirmedAt) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">{{ 'admin.addPlotEmi.hist.total' | translate }}</td>
                <td class="add-plot-emi__num">{{ money(historyTotal(b)) }}</td>
                <td colspan="5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" (click)="detail = null">{{ 'admin.addPlotEmi.close' | translate }}</button>
        </div>
      </div>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="cancelFor as b" (keydown.escape)="closeCancel()">
      <div class="add-plot-emi__modal add-plot-emi__modal--wide" role="dialog" aria-modal="true" aria-labelledby="pc-title">
        <h2 class="add-plot-emi__modal-title" id="pc-title">{{ 'admin.plotCancel.modalTitle' | translate }} · {{ plot(b) }}</h2>
        <app-inline-banner *ngIf="cancelError" tone="danger">{{ cancelError }}</app-inline-banner>

        <dl class="add-plot-emi__facts">
          <div><dt>{{ 'admin.addPlotEmi.col.project' | translate }}</dt><dd>{{ b.projectName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.plot' | translate }}</dt><dd>{{ plot(b) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.buyer' | translate }}</dt><dd>{{ b.buyerName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.associate' | translate }}</dt><dd>{{ b.associateName || '—' }} ({{ b.associateCode || '—' }})</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.area' | translate }}</dt><dd>{{ b.areaSqft != null ? b.areaSqft : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.total' | translate }}</dt><dd>{{ money(b.totalAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.paidAmount' | translate }}</dt><dd>{{ money(b.paidAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.remainingAmount' | translate }}</dt><dd>{{ money(b.dueAmount) }}</dd></div>
        </dl>

        <div class="add-plot-emi__filters">
          <label class="add-plot-emi__field">{{ 'admin.plotCancel.chargePct' | translate }}
            <input type="number" name="chargePct" min="35" max="100" step="0.01" [(ngModel)]="chargePct" />
            <app-field-error [message]="!pctValid() ? ('admin.plotCancel.chargePctError' | translate) : undefined"></app-field-error>
          </label>
          <label class="add-plot-emi__field">{{ 'admin.plotCancel.charge' | translate }}
            <input type="text" name="charge" readonly [value]="money(charge())" />
          </label>
          <label class="add-plot-emi__field">{{ 'admin.plotCancel.refund' | translate }}
            <input type="text" name="refund" readonly [value]="money(refund())" />
          </label>
          <label class="add-plot-emi__field">{{ 'admin.plotCancel.payMode' | translate }}
            <select name="payMode" [(ngModel)]="payMode">
              <option value="">—</option>
              <option *ngFor="let m of payModes" [value]="m">{{ 'admin.invoiceExpenses.payModes.' + m | translate }}</option>
            </select>
            <app-field-error [message]="cancelTried && refund() > 0 && !payMode ? ('admin.plotCancel.payModeRequired' | translate) : undefined"></app-field-error>
          </label>
        </div>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.cancelBooking.reason' | translate }}
          <textarea name="cancelReason" rows="3" maxlength="255" [(ngModel)]="cancelReason"></textarea>
          <app-field-error [message]="cancelTried && !cancelReason.trim() ? ('admin.addPlotEmi.cancelBooking.reasonRequired' | translate) : undefined"></app-field-error>
        </label>
        <p class="add-plot-emi__hint">{{ 'admin.plotCancel.effects' | translate }}</p>

        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="saving" (click)="closeCancel()">{{ 'admin.addPlotEmi.cancelBooking.dismiss' | translate }}</button>
          <button type="button" class="brand-button brand-button--danger add-plot-emi__btn" [disabled]="saving" (click)="confirmCancel()">{{ (saving ? 'admin.addPlotEmi.saving' : 'admin.addPlotEmi.cancelBooking.confirm') | translate }}</button>
        </div>
      </div>
    </div>
  `
})
export class PlotCancelComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);
  private translate = inject(TranslateService);

  money = formatMoney;
  areaFmt = formatArea;
  plot = plotText;

  projects: Project[] = [];
  projectId = '';
  plotNo = '';
  from = isoDate(new Date(Date.now() - 30 * 864e5));
  to = isoDate(new Date());
  page: BookingPage | null = null;
  loading = false;
  loadError = false;
  rangeError = false;
  detail: Booking | null = null;
  detailError = false;
  flash = '';
  saving = false;
  readonly minPct = 35;
  readonly payModes = PAY_MODES;
  cancelFor: Booking | null = null;
  cancelError = '';
  cancelTried = false;
  chargePct: number | null = this.minPct;
  payMode: PayMode | '' = '';
  cancelReason = '';
  private seq = 0;

  ngOnInit(): void {
    this.projectsService.listProjects().subscribe({
      next: p => { this.projects = p; this.projectId = p[0]?.id ?? ''; this.load(); },
      error: () => (this.loadError = true)
    });
  }

  associateId = '';

  onAssociate(id: string): void { this.associateId = id; this.load(); }

  // A cycle is a shortcut for its date range (see CycleSelectComponent).
  onRange(r: { from: string; to: string }): void {
    this.from = r.from; this.to = r.to; this.rangeError = false; this.load();
  }

  onProject(id: string): void { this.projectId = id; this.load(); }
  onPlot(v: string): void { this.plotNo = v.trim(); this.load(); }

  onDate(which: 'from' | 'to', v: string): void {
    this[which] = v;
    this.rangeError = !!this.from && !!this.to && this.from > this.to;
    if (!this.rangeError) { this.load(); } // an inverted range keeps the last valid list
  }

  private filters(): RegisterFilters {
    // Only ACTIVE bookings can be cancelled (BookingService.cancelBooking).
    return { status: 'ACTIVE', associateId: this.associateId, plotId: '', projectId: this.projectId, overdue: false,
      bookedFrom: this.from, bookedTo: this.to, hasPending: false, plotNo: this.plotNo };
  }

  load(): void {
    if (!this.projectId) { return; }
    const seq = ++this.seq;
    this.loading = true;
    this.loadError = false;
    fetchAllPages((p, size) => this.service.list(this.filters(), p, size)).subscribe({
      next: r => { if (seq === this.seq) { this.page = r; this.loading = false; } },
      error: () => { if (seq === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  // List rows may omit installments; refetch the full booking for the popup.
  open(b: Booking): void {
    this.detail = b;
    this.detailError = false;
    this.service.get(b.id).subscribe({
      next: full => { if (this.detail?.id === b.id) { this.detail = full; } },
      error: () => (this.detailError = true)
    });
  }

  history(b: Booking): EmiInstallment[] {
    return (b.installments ?? []).filter(i => (i.status === 'ENTERED' || i.status === 'PAID') && i.paidAt)
      .sort((a, c) => (c.paidAt ?? '').localeCompare(a.paidAt ?? ''));
  }

  dateTime(iso?: string | null): string { return formatIst(iso); }

  historyTotal(b: Booking): number { return round2(this.history(b).reduce((s, i) => s + i.amount, 0)); }

  openCancel(b: Booking): void {
    this.cancelFor = b;
    this.cancelError = '';
    this.cancelTried = false;
    this.chargePct = this.minPct;
    this.payMode = '';
    this.cancelReason = '';
  }

  closeCancel(): void { if (!this.saving) { this.cancelFor = null; } }

  pctValid(): boolean { const p = this.chargePct; return p != null && p >= this.minPct && p <= 100; }

  // Charge is a % of the amount paid (mirrors BookingService.cancelBooking); the refund is what is left.
  charge(): number {
    return this.pctValid() && this.cancelFor ? Math.round(this.cancelFor.paidAmount * this.chargePct! ) / 100 : 0;
  }

  refund(): number { return this.cancelFor && this.pctValid() ? Math.round((this.cancelFor.paidAmount - this.charge()) * 100) / 100 : 0; }

  confirmCancel(): void {
    const b = this.cancelFor;
    this.cancelTried = true;
    const reason = this.cancelReason.trim();
    if (!b || this.saving || !this.pctValid() || !reason || (this.refund() > 0 && !this.payMode)) { return; }
    this.saving = true;
    this.cancelError = '';
    this.service.cancelWithCharge(b.id, { reason, chargePct: this.chargePct!, payMode: this.payMode || null }).subscribe({
      next: () => {
        this.saving = false;
        this.cancelFor = null;
        this.flash = this.translate.instant('admin.plotCancel.success', { plot: plotText(b) });
        this.load();
      },
      error: err => {
        this.saving = false;
        this.cancelError = err.error?.error ?? this.translate.instant('admin.addPlotEmi.err.server');
        if (err.status === 409) { this.load(); }
      }
    });
  }

  sumOf(field: string): number {
    return Math.round((this.page?.bookings ?? []).reduce((acc, b) => acc + ((b as unknown as Record<string, number | null | undefined>)[field] ?? 0), 0) * 100) / 100;
  }
}
