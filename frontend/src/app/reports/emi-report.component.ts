import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { formatArea } from '../shared/utils/plot-grid.util';
import { fetchAllPages } from '../shared/utils/fetch-all-pages';
import { formatMoney, plotText } from '../admin/admin-bookings-emi/bookings-emi.util';
import { AssociateBookingPage } from '../plot-bookings/models/associate-booking-page.model';
import { CycleOption, Leg, ReportsService } from './reports.service';

// Pending EMI of everyone in my downline (same columns as the admin Pending EMI screen).
// Reuses the admin screen's styles; table-fit.ts stacks the table into cards when it can't fit.
@Component({
  selector: 'app-emi-report',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../admin/add-plot-emi/add-plot-emi.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="add-plot-emi" [attr.aria-busy]="loading">
      <div class="add-plot-emi__intro">
        <h1 class="add-plot-emi__title">{{ 'reports.emi.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'reports.emi.subtitle' | translate }}</p>
      </div>

      <div class="add-plot-emi__filters">
        <label class="add-plot-emi__field">{{ 'reports.emi.cycle' | translate }}
          <select name="cycle" (change)="onCycle($any($event.target).value)">
            <option value="">{{ 'reports.emi.allCycles' | translate }}</option>
            <option *ngFor="let c of cycles" [value]="c.id">{{ c.periodStart }} – {{ c.periodEnd || ('reports.emi.open' | translate) }}</option>
          </select>
        </label>
        <label class="add-plot-emi__field">{{ 'reports.column.associateId' | translate }}
          <input type="text" name="associateId" [value]="associateId" (change)="onAssociate($any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'reports.emi.side' | translate }}
          <select name="leg" (change)="onLeg($any($event.target).value)">
            <option value="ALL">{{ 'reports.emi.sideAll' | translate }}</option>
            <option value="L">{{ 'reports.emi.sideLeft' | translate }}</option>
            <option value="R">{{ 'reports.emi.sideRight' | translate }}</option>
          </select>
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'reports.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__list">
        <table class="add-plot-emi__table" [attr.aria-label]="'reports.emi.title' | translate">
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
            </tr>
            <tr *ngIf="page && !page.bookings.length && !loading && !loadError">
              <td class="add-plot-emi__empty-cell" [attr.colspan]="15" role="status">{{ 'admin.addPlotEmi.empty' | translate }}</td>
            </tr>
          </tbody>
          <tfoot *ngIf="page?.bookings?.length">
            <tr class="editable-table__total">
              <td>{{ 'common.total' | translate }}</td>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.area' | translate">{{ areaFmt(sumOf('areaSqft')) }}</td>
              <td></td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.viewBookedPlot.col.extra' | translate">{{ money(sumOf('extraPrice')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.discount' | translate">{{ money(sumOf('discount')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.total' | translate">{{ money(sumOf('totalAmount')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.paid' | translate">{{ money(sumOf('paidAmount')) }}</td>
              <td class="add-plot-emi__num" [attr.data-label]="'admin.addPlotEmi.col.remaining' | translate">{{ money(sumOf('dueAmount')) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `
})
export class EmiReportComponent implements OnInit {
  private service = inject(ReportsService);

  money = formatMoney;
  areaFmt = formatArea;
  plot = plotText;

  cycles: CycleOption[] = [];
  cycleId = '';
  associateId = '';
  leg: Leg = 'ALL';
  page: AssociateBookingPage | null = null;
  loading = false;
  loadError = false;
  private seq = 0;

  ngOnInit(): void {
    // A failed cycle lookup only leaves the dropdown at "All cycles".
    this.service.getCycles().subscribe({ next: c => (this.cycles = c), error: () => (this.cycles = []) });
    this.load();
  }

  onCycle(id: string): void { this.cycleId = id; this.load(); }
  onAssociate(v: string): void { this.associateId = v.trim(); this.load(); }
  onLeg(v: string): void { this.leg = v as Leg; this.load(); }

  load(): void {
    const seq = ++this.seq;
    this.loading = true;
    this.loadError = false;
    const f = { leg: this.leg, associateId: this.associateId, cycleId: this.cycleId };
    fetchAllPages((p, size) => this.service.getEmi(f, p, size)).subscribe({
      next: r => { if (seq === this.seq) { this.page = r; this.loading = false; } },
      error: () => { if (seq === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  sumOf(field: string): number {
    return Math.round((this.page?.bookings ?? []).reduce((acc, b) => acc + ((b as unknown as Record<string, number | null | undefined>)[field] ?? 0), 0) * 100) / 100;
  }
}
