import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleManagementService } from './cycle-management.service';
import { CycleStatus, CyclePage, CycleSummary } from '../models/cycle.model';
import { CycleDetail } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';
import { WalletCreditingResult } from '../models/wallet-crediting-result.model';
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
      <div class="cycle-management__header cycle-management__intro">
        <span class="cycle-management__eyebrow">{{ 'admin.cycleManagement.eyebrow' | translate }}</span>
        <h1 class="cycle-management__title">{{ 'admin.cycleManagement.title' | translate }}</h1>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <div class="cycle-management__current" *ngIf="currentOpenCycle as open">
        <div class="cycle-management__current-meta">
          <span class="cycle-management__current-eyebrow">{{ 'admin.cycleManagement.currentCycleTitle' | translate }}</span>
          <span class="cycle-management__current-period">{{ open.periodStart }} – {{ open.periodEnd }}</span>
          <ng-container *ngTemplateOutlet="cycleRailTpl; context: { status: open.status }"></ng-container>
        </div>
        <div class="cycle-management__current-actions">
          <app-brand-button variant="danger" class="cycle-management__close-cycle-action" (clicked)="closeCycle()">
            {{ 'admin.cycleManagement.closeCycleAction' | translate }}
          </app-brand-button>
        </div>
      </div>

      <app-inline-banner *ngIf="closeResult as result" tone="success" [dismissible]="true" class="cycle-management__close-success" (dismissed)="closeResult = null">
        <p>{{ 'admin.cycleManagement.closeSuccessTitle' | translate }}</p>
        <p>{{ 'admin.cycleManagement.closeSuccessClosedCycleLabel' | translate }}: <strong>{{ result.cycleId }}</strong> ({{ result.status }})</p>
        <p>{{ 'admin.cycleManagement.closeSuccessLegVolumeRowsLabel' | translate }}: <strong>{{ result.legVolumeRowsWritten }}</strong></p>
        <p>{{ 'admin.cycleManagement.closeSuccessNewCycleLabel' | translate }}: <strong>{{ result.newCycleId }}</strong></p>
        <div class="cycle-transition">
          <span class="cycle-chip cycle-chip--closed">{{ result.cycleId }} · {{ result.status }}</span>
          <span class="cycle-transition__arrow">→</span>
          <span class="cycle-chip cycle-chip--open">{{ result.newCycleId }} · OPEN</span>
        </div>
      </app-inline-banner>
      <app-inline-banner *ngIf="closeError === 'conflict'" tone="danger" [dismissible]="true" class="cycle-management__close-conflict-error" (dismissed)="closeError = null">{{ 'admin.cycleManagement.closeConflictError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="closeError === 'generic'" tone="danger" [dismissible]="true" class="cycle-management__close-generic-error" (dismissed)="closeError = null">{{ 'admin.cycleManagement.closeGenericError' | translate }}</app-inline-banner>

      <app-inline-banner *ngIf="creditResult as result" tone="success" [dismissible]="true" class="cycle-management__credit-success" (dismissed)="creditResult = null">
        <p>{{ 'admin.cycleManagement.creditSuccessTitle' | translate }}</p>
        <p>{{ 'admin.cycleManagement.creditSuccessCycleLabel' | translate }}: <strong>{{ result.cycleId }}</strong> ({{ result.newCycleStatus }})</p>
        <p>{{ 'admin.cycleManagement.creditSuccessEntriesLabel' | translate }}: <strong>{{ result.entriesCredited }}</strong></p>
        <p>{{ 'admin.cycleManagement.creditSuccessAmountLabel' | translate }}: <strong>{{ result.totalAmountCredited }}</strong></p>
      </app-inline-banner>
      <app-inline-banner *ngIf="creditError === 'conflict'" tone="danger" [dismissible]="true" class="cycle-management__credit-conflict-error" (dismissed)="creditError = null">{{ 'admin.cycleManagement.creditConflictError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="creditError === 'generic'" tone="danger" [dismissible]="true" class="cycle-management__credit-generic-error" (dismissed)="creditError = null">{{ 'admin.cycleManagement.creditGenericError' | translate }}</app-inline-banner>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="cycle-management__load-error" (dismissed)="loadError = false">{{ 'admin.cycleManagement.loadError' | translate }}</app-inline-banner>

      <div class="cycle-management__filter">
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
        <div class="cycle-management__row-actions">
          <button type="button" class="cycle-management__view-detail-action brand-button brand-button--secondary" (click)="viewDetail(page!.cycles[i].id)">
            {{ 'admin.cycleManagement.viewDetailAction' | translate }}
          </button>
          <button
            type="button"
            *ngIf="page!.cycles[i].status === 'CLOSED'"
            class="cycle-management__credit-wallets-action brand-button brand-button--secondary"
            (click)="creditWallets(page!.cycles[i].id)"
          >
            {{ 'admin.cycleManagement.creditWalletsAction' | translate }}
          </button>
        </div>
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
          <div class="cycle-detail__meta">
            <span class="cycle-detail__period">{{ detail.periodStart }} – {{ detail.periodEnd }}</span>
            <ng-container *ngTemplateOutlet="cycleRailTpl; context: { status: detail.status }"></ng-container>
          </div>
          <ul class="cycle-detail__breakdown cycle-management__breakdown-list">
            <li *ngFor="let row of detail.incomeTypeTotals" class="cycle-detail__row cycle-management__breakdown-row">
              <span class="cycle-detail__row-label">{{ 'admin.cycleManagement.incomeType' + incomeTypeLabelSuffix(row.incomeType) | translate }}</span>
              <span class="cycle-detail__row-value cycle-management__breakdown-amount">{{ row.totalNet }}</span>
            </li>
            <li class="cycle-detail__row cycle-detail__row--total cycle-management__detail-total">
              <span class="cycle-detail__row-label">{{ 'admin.cycleManagement.detailTotalNetLabel' | translate }}</span>
              <span class="cycle-detail__row-value">{{ detail.totalNet }}</span>
            </li>
          </ul>
        </div>
      </app-side-panel>

      <ng-template #cycleRailTpl let-status="status">
        <ol class="cycle-rail" [attr.aria-label]="'Cycle status: ' + status">
          <ng-container *ngFor="let stage of railStages; let last = last">
            <li
              class="cycle-rail__stage"
              [class.cycle-rail__stage--reached]="railStageState(status, stage) === 'reached'"
              [class.cycle-rail__stage--current]="railStageState(status, stage) === 'current'"
            >
              <span class="cycle-rail__dot"></span><span class="cycle-rail__label">{{ railStageLabelKey(stage) | translate }}</span>
            </li>
            <li *ngIf="!last" class="cycle-rail__connector" [class.cycle-rail__connector--reached]="railStageState(status, stage) === 'reached'"></li>
          </ng-container>
        </ol>
      </ng-template>
    </div>
  `
})
export class CycleManagementComponent implements OnInit {
  private cycleManagementService = inject(CycleManagementService);
  private translate = inject(TranslateService);

  // The Cycle Rail's fixed, one-directional sequence (see docs/design/admin_operational_screens/
  // cycle_management/DESIGN.md's "signature element" section) -- mirrors CycleStatus.java exactly.
  readonly railStages: CycleStatus[] = ['OPEN', 'CALCULATING', 'CLOSED', 'PAID'];

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
  creditResult: WalletCreditingResult | null = null;
  creditError: 'conflict' | 'generic' | null = null;
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

  railStageState(status: CycleStatus, stage: CycleStatus): 'reached' | 'current' | 'upcoming' {
    const currentIndex = this.railStages.indexOf(status);
    const stageIndex = this.railStages.indexOf(stage);
    if (stageIndex < currentIndex) {
      return 'reached';
    }
    return stageIndex === currentIndex ? 'current' : 'upcoming';
  }

  railStageLabelKey(stage: CycleStatus): string {
    const keys: Record<CycleStatus, string> = {
      OPEN: 'admin.cycleManagement.statusOpenOption',
      CALCULATING: 'admin.cycleManagement.statusCalculatingOption',
      CLOSED: 'admin.cycleManagement.statusClosedOption',
      PAID: 'admin.cycleManagement.statusPaidOption'
    };
    return keys[stage];
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

  creditWallets(id: string): void {
    this.creditError = null;
    this.cycleManagementService.creditWallets(id).subscribe({
      next: result => {
        this.creditResult = result;
        this.loadPage(this.page?.page ?? 0);
      },
      error: (err: HttpErrorResponse) => {
        this.creditResult = null;
        this.creditError = err.status === 409 ? 'conflict' : 'generic';
      }
    });
  }
}
