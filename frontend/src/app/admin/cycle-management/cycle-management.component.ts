import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleManagementService } from './cycle-management.service';
import { CycleStatus, CyclePage } from '../models/cycle.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  template: `
    <div class="cycle-management">
      <div class="cycle-management__header">
        <h1 class="card-title">{{ 'admin.cycleManagement.title' | translate }}</h1>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <div class="cycle-management__filters">
        <label>
          {{ 'admin.cycleManagement.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.cycleManagement.statusFilterAllOption' | translate }}</option>
            <option value="OPEN">{{ 'admin.cycleManagement.statusOpenOption' | translate }}</option>
            <option value="CALCULATING">{{ 'admin.cycleManagement.statusCalculatingOption' | translate }}</option>
            <option value="CLOSED">{{ 'admin.cycleManagement.statusClosedOption' | translate }}</option>
            <option value="PAID">{{ 'admin.cycleManagement.statusPaidOption' | translate }}</option>
          </select>
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="cycle-management__load-error" (dismissed)="loadError = false">{{ 'admin.cycleManagement.loadError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="historyColumns"
          [rows]="historyRows"
          [emptyStateLabel]="'admin.cycleManagement.emptyState' | translate"
        ></app-editable-table>
      </div>

      <div class="cycle-management__pagination" *ngIf="page">
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.cycleManagement.previousPageAction' | translate }}
        </button>
        <span class="cycle-management__page-indicator">
          {{ 'admin.cycleManagement.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.cycleManagement.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class CycleManagementComponent implements OnInit {
  private cycleManagementService = inject(CycleManagementService);
  private translate = inject(TranslateService);

  page: CyclePage | null = null;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];
  private status: CycleStatus | '' = '';

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.historyColumns = [
      { key: 'periodStart', label: this.translate.instant('admin.cycleManagement.columnPeriodStart'), type: 'text' },
      { key: 'periodEnd', label: this.translate.instant('admin.cycleManagement.columnPeriodEnd'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.cycleManagement.columnStatus'), type: 'text' }
    ];
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value as CycleStatus | '';
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    this.cycleManagementService.list(this.status, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.historyRows = (this.page?.cycles ?? []).map(cycle => ({
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      status: cycle.status
    }));
  }
}
