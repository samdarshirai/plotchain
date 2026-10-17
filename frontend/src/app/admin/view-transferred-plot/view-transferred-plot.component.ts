import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { BookingsEmiService } from '../admin-bookings-emi/bookings-emi.service';
import { PlotTransferPage } from '../admin-bookings-emi/bookings-emi.model';
import { formatMoney } from '../admin-bookings-emi/bookings-emi.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

const PAGE_SIZE = 20;
const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

@Component({
  selector: 'app-view-transferred-plot',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../add-plot-emi/add-plot-emi.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, FieldErrorComponent],
  template: `
    <div class="add-plot-emi">
      <div class="add-plot-emi__intro">
        <span class="add-plot-emi__eyebrow">{{ 'admin.addPlotEmi.eyebrow' | translate }}</span>
        <h1 class="add-plot-emi__title">{{ 'admin.viewTransferredPlot.title' | translate }}</h1>
        <p class="add-plot-emi__subtitle">{{ 'admin.viewTransferredPlot.subtitle' | translate }}</p>
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

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.addPlotEmi.loadError' | translate }}
        <button type="button" class="add-plot-emi__link" (click)="load()">{{ 'admin.addPlotEmi.retry' | translate }}</button>
      </app-inline-banner>

      <div class="add-plot-emi__list" *ngIf="page" [attr.aria-busy]="loading">
        <div class="add-plot-emi__scroll">
          <table class="add-plot-emi__table" [attr.aria-label]="'admin.viewTransferredPlot.title' | translate" *ngIf="page.transfers.length">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.viewBookedPlot.col.sNo' | translate }}</th>
                <th scope="col">{{ 'admin.viewTransferredPlot.col.transferDate' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.associateId' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.mobile' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.project' | translate }}</th>
                <th scope="col">{{ 'admin.addPlotEmi.col.plot' | translate }}</th>
                <th scope="col">{{ 'admin.viewTransferredPlot.col.oldPlot' | translate }}</th>
                <th scope="col">{{ 'admin.viewTransferredPlot.col.paid' | translate }}</th>
                <th scope="col">{{ 'admin.viewTransferredPlot.col.rest' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of page.transfers; let i = index">
                <td [attr.data-label]="'admin.viewBookedPlot.col.sNo' | translate">{{ page.page * pageSize + i + 1 }}</td>
                <td [attr.data-label]="'admin.viewTransferredPlot.col.transferDate' | translate">{{ r.transferDate.slice(0, 10) }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associateId' | translate">{{ r.associateCode || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.associate' | translate">{{ r.associateName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.mobile' | translate">{{ r.associatePhone || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.project' | translate">{{ r.projectName || '—' }}</td>
                <td [attr.data-label]="'admin.addPlotEmi.col.plot' | translate">{{ r.plotNo || '—' }}</td>
                <td [attr.data-label]="'admin.viewTransferredPlot.col.oldPlot' | translate">{{ r.oldPlotNo || '—' }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewTransferredPlot.col.paid' | translate">{{ money(r.paidAmount) }}</td>
                <td class="add-plot-emi__num" [attr.data-label]="'admin.viewTransferredPlot.col.rest' | translate">{{ money(r.restAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="add-plot-emi__hint" *ngIf="!page.transfers.length">{{ 'admin.viewTransferredPlot.empty' | translate }}</p>
        <div class="add-plot-emi__pager" *ngIf="page.transfers.length">
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="page.page === 0" (click)="load(page.page - 1)">{{ 'admin.addPlotEmi.previous' | translate }}</button>
          <span>{{ 'admin.addPlotEmi.pager' | translate: { page: page.page + 1, totalPages: totalPages, count: page.totalElements } }}</span>
          <button type="button" class="brand-button brand-button--secondary add-plot-emi__btn" [disabled]="page.page + 1 >= totalPages" (click)="load(page.page + 1)">{{ 'admin.addPlotEmi.next' | translate }}</button>
        </div>
      </div>
    </div>
  `
})
export class ViewTransferredPlotComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private projectsService = inject(ProjectsService);

  readonly pageSize = PAGE_SIZE;
  money = formatMoney;

  projects: Project[] = [];
  projectId = '';
  from = isoDate(new Date(Date.now() - 30 * 864e5));
  to = isoDate(new Date());
  page: PlotTransferPage | null = null;
  loading = false;
  loadError = false;
  rangeError = false;
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

  load(p = this.page?.page ?? 0): void {
    if (!this.projectId) { return; }
    const seq = ++this.seq;
    this.loading = true;
    this.loadError = false;
    this.service.plotTransfers({ from: this.from, to: this.to, projectId: this.projectId }, p, PAGE_SIZE).subscribe({
      next: r => { if (seq === this.seq) { this.page = r; this.loading = false; } },
      error: () => { if (seq === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
