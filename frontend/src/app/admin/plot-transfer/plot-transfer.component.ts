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
import { ProjectsPlotsService } from '../projects-plots/projects-plots.service';
import { PlotGridItem } from '../../shared/utils/plot-grid.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

const PAGE_SIZE = 20;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

@Component({
  selector: 'app-plot-transfer',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../add-plot-emi/add-plot-emi.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.plotTransfer.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.plotTransfer.subtitle' | translate }}</p>
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
      </div>
      <app-field-error [message]="rangeError ? ('admin.addPlotEmi.rangeError' | translate) : undefined"></app-field-error>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = ''">{{ flash }}</app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__list" *ngIf="page" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <table class="add-plot-emi__table" [attr.aria-label]="'admin.plotTransfer.title' | translate" *ngIf="page.bookings.length">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.viewBookedPlot.col.sNo' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.associateId' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.mobile' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.project' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.plot' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.plotType' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.area' | translate }}</th>
                <th scope="col">{{ 'admin.viewBookedPlot.col.rate' | translate }}</th>
                <th scope="col">{{ 'admin.viewBookedPlot.col.extra' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.discount' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.total' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.paid' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.remaining' | translate }}</th>
                <th scope="col">{{ 'admin.plotTransfer.col.actions' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page.bookings; let i = index">
                <td [attr.data-label]="'admin.viewBookedPlot.col.sNo' | translate">{{ page.page * pageSize + i + 1 }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.bookedOn' | translate">{{ b.bookedAt ? b.bookedAt.slice(0, 10) : '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ b.associateCode || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ b.associateName || '—' }}</td>
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
                <td class="add-plot-emi__actions">
                  <button type="button" class="brand-button add-plot-emi__btn" (click)="open(b)">{{ 'admin.viewBookedPlot.col.detail' | translate }}</button>
                  <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" (click)="openTransfer(b)">{{ 'admin.plotTransfer.transfer' | translate }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="add-plot-emi__hint" *ngIf="!page.bookings.length">{{ 'admin.addPlotEmi.empty' | translate }}</p>
        <div class="add-plot-emi__pager" *ngIf="page.bookings.length">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="page.page === 0" (click)="load(page.page - 1)">{{ 'admin.addPlotEmi.previous' | translate }}</button>
          <span>{{ 'admin.addPlotEmi.pager' | translate: { page: page.page + 1, totalPages: totalPages, count: page.totalElements } }}</span>
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="page.page + 1 >= totalPages" (click)="load(page.page + 1)">{{ 'admin.addPlotEmi.next' | translate }}</button>
        </div>
      </div>
    </div>

    <div class="add-plot-emi__overlay" *ngIf="detail as b" (keydown.escape)="detail = null" (click)="$event.target === $event.currentTarget && (detail = null)">
      <div class="add-plot-emi__modal add-plot-emi__modal--wide" role="dialog" aria-modal="true" aria-labelledby="vbp-title">
        <h2 class="add-plot-emi__modal-title" id="vbp-title">{{ 'admin.viewBookedPlot.detailTitle' | translate }} · {{ plot(b) }}</h2>
        <app-inline-banner *ngIf="detailError" tone="danger">{{ 'admin.addPlotEmi.loadError' | translate }}</app-inline-banner>

        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.plotDetails' | translate }}</h3>
        <dl class="add-plot-emi__facts">
          <div><dt>{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</dt><dd>{{ b.bookedAt ? b.bookedAt.slice(0, 10) : '—' }}</dd></div>
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
                <th scope="col">{{ 'admin.addPlotEmi.hist.sNo' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.paymentDate' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.amount' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.mode' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.txn' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.txnDate' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.status' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.hist.confirmedDate' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let i of history(b); let n = index">
                <td [attr.data-label]="'admin.addPlotEmi.hist.sNo' | translate">{{ n + 1 }}</td>
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

    <div class="add-plot-emi__overlay" *ngIf="transferFor as b" (keydown.escape)="closeTransfer()">
      <div class="add-plot-emi__modal add-plot-emi__modal--wide" role="dialog" aria-modal="true" aria-labelledby="pt-tr-title">
        <h2 class="add-plot-emi__modal-title" id="pt-tr-title">{{ 'admin.addPlotEmi.transfer.title' | translate }}</h2>
        <app-inline-banner *ngIf="transferError" tone="danger">{{ transferError }}</app-inline-banner>

        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.transfer.overview' | translate }}</h3>
        <dl class="add-plot-emi__facts">
          <div><dt>{{ 'admin.addPlotEmi.col.project' | translate }}</dt><dd>{{ b.projectName || '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.transfer.currentPlot' | translate }}</dt><dd>{{ plot(b) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.buyer' | translate }}</dt><dd>{{ b.buyerName }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.associate' | translate }}</dt><dd>{{ b.associateName || '—' }} ({{ b.associateCode || '—' }})</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.area' | translate }}</dt><dd>{{ b.areaSqft != null ? b.areaSqft : '—' }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.discount' | translate }}</dt><dd>{{ money(b.discount || 0) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.col.total' | translate }}</dt><dd>{{ money(b.totalAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.paidAmount' | translate }}</dt><dd>{{ money(b.paidAmount) }}</dd></div>
          <div><dt>{{ 'admin.addPlotEmi.remainingAmount' | translate }}</dt><dd>{{ money(b.dueAmount) }}</dd></div>
        </dl>

        <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.transfer.pickPlot' | translate }}</h3>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.transfer.search' | translate }}
          <input type="search" name="plotQ" [(ngModel)]="plotQ" [placeholder]="'admin.addPlotEmi.transfer.searchPlaceholder' | translate" />
        </label>
        <p class="add-plot-emi__hint" *ngIf="plotsLoading">{{ 'admin.addPlotEmi.transfer.loading' | translate }}</p>
        <p class="add-plot-emi__hint" *ngIf="!plotsLoading && !matchingPlots().length">{{ 'admin.addPlotEmi.transfer.none' | translate }}</p>
        <ul class="add-plot-emi__plots" role="listbox" *ngIf="matchingPlots().length">
          <li *ngFor="let p of matchingPlots()" role="option" [attr.aria-selected]="p.plotId === selectedPlot?.plotId">
            <button type="button" class="add-plot-emi__plot" [class.add-plot-emi__plot--on]="p.plotId === selectedPlot?.plotId" (click)="selectedPlot = p">
              <strong>{{ p.plotNo }}</strong>
              <span>{{ 'admin.projectsPlots.type.' + p.type | translate }} · {{ p.area }}</span>
              <span>{{ money(p.price + (p.extraPrice || 0)) }}</span>
            </button>
          </li>
        </ul>

        <ng-container *ngIf="selectedPlot as np">
          <h3 class="add-plot-emi__section">{{ 'admin.addPlotEmi.transfer.confirmTitle' | translate }}</h3>
          <dl class="add-plot-emi__facts">
            <div><dt>{{ 'admin.addPlotEmi.transfer.from' | translate }}</dt><dd>{{ plot(b) }}</dd></div>
            <div><dt>{{ 'admin.addPlotEmi.transfer.to' | translate }}</dt><dd>{{ np.plotNo }}</dd></div>
            <div><dt>{{ 'admin.addPlotEmi.transfer.newTotal' | translate }}</dt><dd>{{ money(newTotal(b, np)) }}</dd></div>
            <div><dt>{{ 'admin.addPlotEmi.transfer.newBalance' | translate }}</dt><dd>{{ money(newTotal(b, np) - b.paidAmount) }}</dd></div>
          </dl>
          <p class="add-plot-emi__hint">{{ 'admin.addPlotEmi.transfer.effects' | translate }}</p>
        </ng-container>

        <div class="add-plot-emi__footer">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="saving" (click)="closeTransfer()">{{ 'admin.addPlotEmi.cancel' | translate }}</button>
          <button type="button" class="brand-button add-plot-emi__btn" [disabled]="saving || !selectedPlot" (click)="confirmTransfer()">{{ (saving ? 'admin.addPlotEmi.saving' : 'admin.addPlotEmi.transfer.confirm') | translate }}</button>
        </div>
      </div>
    </div>
  `
})
export class PlotTransferComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);
  private plotsService = inject(ProjectsPlotsService);
  private translate = inject(TranslateService);

  readonly pageSize = PAGE_SIZE;
  money = formatMoney;
  plot = plotText;

  projects: Project[] = [];
  projectId = '';
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
  transferFor: Booking | null = null;
  transferError = '';
  availablePlots: PlotGridItem[] = [];
  selectedPlot: PlotGridItem | null = null;
  plotQ = '';
  plotsLoading = false;
  private seq = 0;

  get totalPages(): number { return this.page ? Math.max(1, Math.ceil(this.page.totalElements / PAGE_SIZE)) : 1; }

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

  private filters(): RegisterFilters {
    // Only ACTIVE bookings can be transferred (BookingService.transferPlot).
    return { status: 'ACTIVE', associateId: '', plotId: '', projectId: this.projectId, overdue: false,
      bookedFrom: this.from, bookedTo: this.to, hasPending: false };
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

  dateTime(iso?: string | null): string {
    if (!iso) { return '—'; }
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  historyTotal(b: Booking): number { return round2(this.history(b).reduce((s, i) => s + i.amount, 0)); }

  openTransfer(b: Booking): void {
    this.transferFor = b;
    this.availablePlots = [];
    this.selectedPlot = null;
    this.plotQ = '';
    this.transferError = '';
    this.plotsLoading = true;
    this.plotsService.getGrid(this.projectId).subscribe({
      next: g => {
        if (this.transferFor !== b) { return; }
        this.availablePlots = g.filter(p => p.status === 'AVAILABLE' && p.plotId !== b.plotId);
        this.plotsLoading = false;
      },
      error: () => {
        this.plotsLoading = false;
        this.transferError = this.translate.instant('admin.addPlotEmi.transfer.loadError');
      }
    });
  }

  closeTransfer(): void { if (!this.saving) { this.transferFor = null; } }

  matchingPlots(): PlotGridItem[] {
    const q = this.plotQ.trim().toLowerCase();
    return q ? this.availablePlots.filter(p => p.plotNo.toLowerCase().includes(q)) : this.availablePlots;
  }

  // Mirrors BookingService.transferPlot: the new plot's price + extra, minus the booking's kept discount.
  newTotal(b: Booking, p: PlotGridItem): number { return round2(p.price + (p.extraPrice || 0) - (b.discount || 0)); }

  confirmTransfer(): void {
    const b = this.transferFor, p = this.selectedPlot;
    if (!b || !p || this.saving) { return; }
    this.saving = true;
    this.transferError = '';
    this.service.transferPlot(b.id, p.plotId).subscribe({
      next: () => {
        this.saving = false;
        this.transferFor = null;
        this.flash = this.translate.instant('admin.addPlotEmi.transfer.success', { from: plotText(b), to: p.plotNo });
        this.load();
      },
      error: err => {
        this.saving = false;
        this.transferError = err.error?.error ?? this.translate.instant('admin.addPlotEmi.err.server');
        if (err.status === 409) { this.load(); }
      }
    });
  }
}
