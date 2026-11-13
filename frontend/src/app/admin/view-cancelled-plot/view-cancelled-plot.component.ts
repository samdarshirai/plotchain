import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { BookingsEmiService } from '../admin-bookings-emi/bookings-emi.service';
import { BookingPage, RegisterFilters } from '../admin-bookings-emi/bookings-emi.model';
import { formatMoney, plotText } from '../admin-bookings-emi/bookings-emi.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { formatArea } from '../../shared/utils/plot-grid.util';
import { fetchAllPages } from '../../shared/utils/fetch-all-pages';
import { TableToolsComponent } from '../../shared/components/table-tools/table-tools.component';

const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

@Component({
  selector: 'app-view-cancelled-plot',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../add-plot-emi/add-plot-emi.component.scss'],
  imports: [TableToolsComponent, CommonModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.viewCancelledPlot.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.viewCancelledPlot.subtitle' | translate }}</p>
      </div>

      <div class="add-plot-emi__filters">
        <label class="add-plot-emi__field">{{ 'admin.viewCancelledPlot.from' | translate }}
          <input type="date" name="from" [value]="from" [attr.max]="to || null" (change)="onDate('from', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.viewCancelledPlot.to' | translate }}
          <input type="date" name="to" [value]="to" [attr.min]="from || null" (change)="onDate('to', $any($event.target).value)" />
        </label>
        <label class="add-plot-emi__field">{{ 'admin.addPlotEmi.project' | translate }}
          <select name="project" (change)="onProject($any($event.target).value)">
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === projectId">{{ p.name }}</option>
          </select>
        </label>
      </div>
      <app-field-error [message]="rangeError ? ('admin.addPlotEmi.rangeError' | translate) : undefined"></app-field-error>

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__list" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <app-table-tools filename="cancelled-plot"></app-table-tools>
          <table class="add-plot-emi__table" [attr.aria-label]="'admin.viewCancelledPlot.title' | translate">
            <thead>
              <tr>
                <th scope="col" class="table__sno"><span class="material-symbols-outlined th-icon" aria-hidden="true">tag</span>{{ 'admin.viewBookedPlot.col.sNo' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.addPlotEmi.col.bookedOn' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">badge</span>{{ 'admin.addPlotEmi.col.associateId' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">groups</span>{{ 'admin.addPlotEmi.col.associate' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">call</span>{{ 'admin.addPlotEmi.col.mobile' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">person</span>{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">call</span>{{ 'admin.bookingsEmi.col.buyerMobile' | translate }}</th>
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
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.bookingsEmi.col.cancelledOn' | translate }}</th>
                <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">notes</span>{{ 'admin.bookingsEmi.col.cancelReason' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page?.bookings; let i = index">
                <td class="table__sno" [attr.data-label]="'admin.viewBookedPlot.col.sNo' | translate">{{ i + 1 }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.bookedOn' | translate">{{ b.bookedAt ? (b.bookedAt | date: 'd MMM y, h:mm:ss a' : '+0530') : '—' }}</td>
                <td class="editable-table__cell--bold" [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ b.associateCode || '—' }}</td>
                <td class="editable-table__cell--bold" [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ b.associateName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.mobile' | translate">{{ b.associatePhone || '—' }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate">{{ b.buyerName || '—' }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.buyerMobile' | translate">{{ b.buyerPhone || '—' }}</td>
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
                <td [attr.data-label]="'admin.bookingsEmi.col.cancelledOn' | translate">{{ b.cancelledAt ? (b.cancelledAt | date: 'd MMM y, h:mm:ss a' : '+0530') : '—' }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.cancelReason' | translate">{{ b.cancelReason || '—' }}</td>
              </tr>
              <tr *ngIf="!page?.bookings?.length">
                <td class="add-plot-emi__empty-cell" [attr.colspan]="19">{{ 'admin.viewCancelledPlot.empty' | translate }}</td>
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
              <td></td>
            </tr>
          </tfoot>
          </table>
        </div>
      </div>
    </div>

  `
})
export class ViewCancelledPlotComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);

  money = formatMoney;
  areaFmt = formatArea;
  plot = plotText;

  projects: Project[] = [];
  projectId = '';
  from = isoDate(new Date(Date.now() - 30 * 864e5));
  to = isoDate(new Date());
  page: BookingPage | null = null;
  loading = false;
  loadError = false;
  rangeError = false;
  private seq = 0;

  ngOnInit(): void {
    this.projectsService.listProjects().subscribe({
      next: p => { this.projects = p; this.projectId = p[0]?.id ?? ''; this.load(); },
      error: () => (this.loadError = true)
    });
  }

  onProject(id: string): void { this.projectId = id; this.load(); }

  onDate(which: 'from' | 'to', v: string): void {
    this[which] = v;
    this.rangeError = !!this.from && !!this.to && this.from > this.to;
    if (!this.rangeError) { this.load(); } // an inverted range keeps the last valid list
  }

  private filters(): RegisterFilters {
    return { status: 'CANCELLED', associateId: '', plotId: '', projectId: this.projectId, overdue: false,
      cancelledFrom: this.from, cancelledTo: this.to };
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

  sumOf(field: string): number {
    return Math.round((this.page?.bookings ?? []).reduce((acc, b) => acc + ((b as unknown as Record<string, number | null | undefined>)[field] ?? 0), 0) * 100) / 100;
  }
}
