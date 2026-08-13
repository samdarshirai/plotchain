import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleManagementService } from './cycle-management.service';
import { CycleStatus, CyclePage, CycleSummary } from '../models/cycle.model';
import { CycleDetail } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent, SidePanelComponent, BrandButtonComponent],
  template: `
    <div class="cycle-management">
      <div class="cycle-management__header">
        <h1 class="card-title">{{ 'admin.cycleManagement.title' | translate }}</h1>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <div class="cycle-management__current card" *ngIf="currentOpenCycle as open">
        <h2>{{ 'admin.cycleManagement.currentCycleTitle' | translate }}</h2>
        <p>{{ 'admin.cycleManagement.currentCyclePeriodLabel' | translate }}: {{ open.periodStart }} – {{ open.periodEnd }}</p>
        <app-brand-button variant="danger" class="cycle-management__close-cycle-action" (clicked)="closeCycle()">
          {{ 'admin.cycleManagement.closeCycleAction' | translate }}
        </app-brand-button>
      </div>

      <app-inline-banner *ngIf="closeResult as result" tone="success" [dismissible]="true" class="cycle-management__close-success" (dismissed)="closeResult = null">
        <p>{{ 'admin.cycleManagement.closeSuccessTitle' | translate }}</p>
        <p>{{ 'admin.cycleManagement.closeSuccessClosedCycleLabel' | translate }}: <strong>{{ result.cycleId }}</strong> ({{ result.status }})</p>
        <p>{{ 'admin.cycleManagement.closeSuccessLegVolumeRowsLabel' | translate }}: <strong>{{ result.legVolumeRowsWritten }}</strong></p>
        <p>{{ 'admin.cycleManagement.closeSuccessNewCycleLabel' | translate }}: <strong>{{ result.newCycleId }}</strong></p>
      </app-inline-banner>
      <app-inline-banner *ngIf="closeError === 'conflict'" tone="danger" [dismissible]="true" class="cycle-management__close-conflict-error" (dismissed)="closeError = null">{{ 'admin.cycleManagement.closeConflictError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="closeError === 'generic'" tone="danger" [dismissible]="true" class="cycle-management__close-generic-error" (dismissed)="closeError = null">{{ 'admin.cycleManagement.closeGenericError' | translate }}</app-inline-banner>

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
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.cycleManagement.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <button type="button" class="cycle-management__view-detail-action brand-button brand-button--secondary" (click)="viewDetail(page!.cycles[i].id)">
          {{ 'admin.cycleManagement.viewDetailAction' | translate }}
        </button>
      </ng-template>

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

      <app-side-panel
        [open]="detailPanelOpen"
        [title]="'admin.cycleManagement.detailPanelTitle' | translate"
        (closed)="closeDetailPanel()"
      >
        <app-inline-banner *ngIf="detailError" tone="danger" class="cycle-management__detail-error">{{ 'admin.cycleManagement.detailError' | translate }}</app-inline-banner>
        <div class="cycle-management__detail-body" *ngIf="selectedDetail as detail">
          <p><strong>{{ 'admin.cycleManagement.detailPeriodLabel' | translate }}:</strong> {{ detail.periodStart }} – {{ detail.periodEnd }}</p>
          <p><strong>{{ 'admin.cycleManagement.detailStatusLabel' | translate }}:</strong> {{ detail.status }}</p>
          <h3>{{ 'admin.cycleManagement.detailBreakdownTitle' | translate }}</h3>
          <ul class="cycle-management__breakdown-list">
            <li *ngFor="let row of detail.incomeTypeTotals" class="cycle-management__breakdown-row">
              <span>{{ 'admin.cycleManagement.incomeType' + incomeTypeLabelSuffix(row.incomeType) | translate }}</span>
              <span class="cycle-management__breakdown-amount">{{ row.totalNet }}</span>
            </li>
          </ul>
          <p class="cycle-management__detail-total"><strong>{{ 'admin.cycleManagement.detailTotalNetLabel' | translate }}:</strong> {{ detail.totalNet }}</p>
        </div>
      </app-side-panel>
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
  selectedDetail: CycleDetail | null = null;
  detailPanelOpen = false;
  detailError = false;
  currentOpenCycle: CycleSummary | null = null;
  closeResult: CycleCloseResponse | null = null;
  closeError: 'conflict' | 'generic' | null = null;
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
      { key: 'status', label: this.translate.instant('admin.cycleManagement.columnStatus'), type: 'text' },
      { key: 'actions', label: this.translate.instant('admin.cycleManagement.columnActions'), type: 'action' }
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
        // Only an UNFILTERED load is informative about whether an OPEN cycle exists -- see
        // this task's "Design decision" note. A filtered page's absence of an OPEN row must not
        // clear a previously-known currentOpenCycle.
        if (!this.status) {
          this.currentOpenCycle = res.cycles.find(c => c.status === 'OPEN') ?? null;
        }
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

  viewDetail(id: string): void {
    this.detailError = false;
    this.selectedDetail = null;
    this.cycleManagementService.detail(id).subscribe({
      next: detail => {
        this.selectedDetail = detail;
        this.detailPanelOpen = true;
      },
      error: () => (this.detailError = true)
    });
  }

  closeDetailPanel(): void {
    this.detailPanelOpen = false;
  }

  incomeTypeLabelSuffix(incomeType: string): string {
    // 'SPONSOR_MATCHING' -> 'SponsorMatching', matching the i18n key suffixes above.
    return incomeType
      .toLowerCase()
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Label';
  }

  closeCycle(): void {
    if (!this.currentOpenCycle) {
      return;
    }
    this.closeError = null;
    this.cycleManagementService.close(this.currentOpenCycle.id).subscribe({
      next: result => {
        this.closeResult = result;
        this.loadPage(0);
      },
      error: (err: HttpErrorResponse) => {
        this.closeResult = null;
        this.closeError = err.status === 409 ? 'conflict' : 'generic';
      }
    });
  }
}
