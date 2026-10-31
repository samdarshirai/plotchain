import { Component, OnInit, inject } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleManagementService } from './cycle-management.service';
import { CycleStatus, CyclePage, CycleSummary } from '../models/cycle.model';
import { CycleDetail, CycleIncomeType } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';
import { WalletCreditingResult } from '../models/wallet-crediting-result.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';
import { AdminDashboardService } from '../../admin-dashboard/admin-dashboard.service';
import { CurrentCycleStats } from '../../admin-dashboard/admin-dashboard.model';
import { formatInr } from '../../shared/utils/plot-grid.util';

const PAGE_SIZE = 20;
const INCOME_TYPES: CycleIncomeType[] = ['DIRECT', 'MATCHING', 'SPONSOR_MATCHING', 'ROYALTY', 'REWARD'];
// Key order = table order; 'totalNet' sits between ROYALTY and REWARD, so the loop below can't be a single map.
const COLUMN_KEYS = [
  'DIRECT', 'MATCHING', 'SPONSOR_MATCHING', 'ROYALTY', 'totalNet', 'REWARD'
];
const COLUMN_LABEL_KEYS: Record<string, string> = {
  DIRECT: 'columnDirect', MATCHING: 'columnMatching', SPONSOR_MATCHING: 'columnSponsor',
  ROYALTY: 'columnRoyalty', totalNet: 'columnTotalIncome', REWARD: 'columnReward'
};

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    EditableTableComponent,
    InlineBannerComponent,
    BrandButtonComponent
  ],
  template: `
    <div class="cycle-management">
      <div class="cycle-management__intro">
        <span class="cycle-management__eyebrow">{{ 'admin.cycleManagement.eyebrow' | translate }}</span>
        <h1 class="cycle-management__title">{{ 'admin.cycleManagement.title' | translate }}</h1>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <section class="cycle-management__current" *ngIf="currentOpenCycle as open">
        <div class="cycle-management__current-head">
          <div class="cycle-management__current-meta">
            <span class="cycle-management__current-eyebrow">{{ 'admin.cycleManagement.currentCycleTitle' | translate }}</span>
            <span class="cycle-management__current-period">{{ open.periodStart }} – {{ open.periodEnd }}</span>
            <ng-container *ngTemplateOutlet="cycleRailTpl; context: { status: open.status }"></ng-container>
          </div>
          <ng-container *ngIf="currentCycleStats as stats">
          <div class="cycle-progress">
            <div class="cycle-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="progressPercent">
              <span class="cycle-progress__fill" [style.width.%]="progressPercent"></span>
            </div>
            <span class="cycle-progress__label">{{ stats.daysRemaining }} {{ 'admin.cycleManagement.daysRemainingLabel' | translate }}</span>
          </div>
          </ng-container>
          <div class="cycle-management__current-actions">
            <app-brand-button variant="danger" class="cycle-management__close-cycle-action" (clicked)="closeCycle()">
              {{ 'admin.cycleManagement.closeCycleAction' | translate }}
            </app-brand-button>
          </div>
        </div>

        <ng-container *ngIf="currentCycleStats as stats">
          <div class="cycle-management__stats">
            <div class="cycle-metric cycle-metric--hero">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.totalIncomeLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.totalIncome | currency:'INR':'symbol':'1.2-2' }}</span>
              <span class="cycle-metric__delta" *ngIf="incomeDelta !== null" [class.cycle-metric__delta--down]="incomeDelta < 0">
                {{ incomeDelta >= 0 ? '▲' : '▼' }} {{ incomeDelta | number:'1.0-1' }}% {{ 'admin.cycleManagement.vsPreviousCycleLabel' | translate }}
              </span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.directIncomeLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.directIncome | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.matchingIncomeLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.matchingIncome | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.newAssociatesLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.newAssociatesThisCycle }}</span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.salesThisCycleLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.salesThisCycle }}</span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.revenueThisCycleLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.revenueThisCycle | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
          </div>
        </ng-container>
      </section>

      <div class="cycle-popup__overlay" *ngIf="closeResult || closeError">
        <div class="cycle-popup" role="dialog" aria-modal="true">
          <ng-container *ngIf="closeResult as result">
            <h2 class="cycle-popup__title cycle-popup__title--success cycle-management__close-success">{{ 'admin.cycleManagement.closeSuccessTitle' | translate }}</h2>
            <p>{{ 'admin.cycleManagement.closeSuccessClosedCycleLabel' | translate }}: <strong>{{ result.cycleId }}</strong> ({{ result.status }})</p>
            <p>{{ 'admin.cycleManagement.closeSuccessLegVolumeRowsLabel' | translate }}: <strong>{{ result.legVolumeRowsWritten }}</strong></p>
            <p>{{ 'admin.cycleManagement.closeSuccessNewCycleLabel' | translate }}: <strong>{{ result.newCycleId }}</strong></p>
          </ng-container>
          <ng-container *ngIf="closeError">
            <h2 class="cycle-popup__title cycle-popup__title--error">{{ 'admin.cycleManagement.closeErrorTitle' | translate }}</h2>
            <p class="cycle-management__close-error">{{ closeError }}</p>
          </ng-container>
          <div class="cycle-popup__footer">
            <button type="button" class="brand-button cycle-management__close-popup-action" (click)="dismissClosePopup()">{{ 'admin.cycleManagement.closePopupAction' | translate }}</button>
          </div>
        </div>
      </div>

      <section class="cycle-management__no-cycle" *ngIf="page && !currentOpenCycle">
        <p>{{ 'admin.cycleManagement.noOpenCycle' | translate }}</p>
        <app-brand-button class="cycle-management__open-cycle-action" (clicked)="openCycle()">
          {{ 'admin.cycleManagement.openCycleAction' | translate }}
        </app-brand-button>
      </section>
      <app-inline-banner *ngIf="openError" tone="danger" [dismissible]="true" class="cycle-management__open-error" (dismissed)="openError = null">{{ openError }}</app-inline-banner>

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
  private adminDashboardService = inject(AdminDashboardService);

  // The Cycle Rail's fixed, one-directional sequence (see docs/design/admin_operational_screens/
  // cycle_management/DESIGN.md's "signature element" section) -- mirrors CycleStatus.java exactly.
  readonly railStages: CycleStatus[] = ['OPEN', 'CALCULATING', 'CLOSED'];

  page: CyclePage | null = null;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];
  currentOpenCycle: CycleSummary | null = null;
  // The 6 cycle-income fields relocated here from admin-dashboard.component.ts (Task 3): sourced
  // from the same /api/admin/stats endpoint's currentCycle, which is null exactly when there's no
  // OPEN cycle -- same condition as currentOpenCycle above, so the two never disagree in practice.
  currentCycleStats: CurrentCycleStats | null = null;
  closeResult: CycleCloseResponse | null = null;
  closeError: string | null = null;
  openError: string | null = null;
  creditResult: WalletCreditingResult | null = null;
  creditError: 'conflict' | 'generic' | null = null;
  private status: CycleStatus | '' = '';

  // Share of the current cycle's days already elapsed (daysRemaining comes from the stats endpoint).
  get progressPercent(): number {
    const stats = this.currentCycleStats;
    if (!stats) {
      return 0;
    }
    const days = (new Date(stats.periodEnd).getTime() - new Date(stats.periodStart).getTime()) / 86400000 + 1;
    return Math.min(100, Math.max(0, Math.round(((days - stats.daysRemaining) / days) * 100)));
  }

  // % change of total income vs the previous cycle; null when there's nothing to compare against.
  get incomeDelta(): number | null {
    const stats = this.currentCycleStats;
    return stats?.previousCycleTotalIncome ? ((stats.totalIncome - stats.previousCycleTotalIncome) / stats.previousCycleTotalIncome) * 100 : null;
  }

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
      { key: 'period', label: this.translate.instant('admin.cycleManagement.columnPeriod'), type: 'text' },
      {
        key: 'status',
        label: this.translate.instant('admin.cycleManagement.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      },
      { key: 'business', label: this.translate.instant('admin.cycleManagement.columnBusiness'), type: 'text' },
      ...COLUMN_KEYS.map(k => ({
        key: k,
        label: this.translate.instant('admin.cycleManagement.' + COLUMN_LABEL_KEYS[k]),
        type: 'text' as const
      })),
      { key: 'tripExpense', label: this.translate.instant('admin.cycleManagement.columnTripExpense'), type: 'text' },
      { key: 'commissionExpense', label: this.translate.instant('admin.cycleManagement.columnCommissionExpense'), type: 'text' },
      { key: 'commissionPct', label: this.translate.instant('admin.cycleManagement.columnCommissionPct'), type: 'text' },
      { key: 'actions', label: this.translate.instant('admin.cycleManagement.columnActions'), type: 'action' }
    ];
    this.loadPage(0);
    this.loadCurrentCycleStats();
  }

  private loadCurrentCycleStats(): void {
    this.adminDashboardService.getStats().subscribe(res => (this.currentCycleStats = res.currentCycle));
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

  // List endpoint has no income totals, so fetch each row's detail (<= PAGE_SIZE calls); a failed
  // detail just leaves that row's income cells blank.
  private updateTableRows(): void {
    const cycles = this.page?.cycles ?? [];
    this.historyRows = cycles.map(c => this.toRow(c, null));
    if (!cycles.length) {
      return;
    }
    forkJoin(cycles.map(c => this.cycleManagementService.detail(c.id).pipe(catchError(() => of(null))))).subscribe(
      details => (this.historyRows = cycles.map((c, i) => this.toRow(c, details[i])))
    );
  }

  private toRow(cycle: CycleSummary, detail: CycleDetail | null): Record<string, string> {
    const row: Record<string, string> = {
      period: `${cycle.periodStart} – ${cycle.periodEnd}`,
      status: cycle.status
    };
    for (const t of INCOME_TYPES) {
      row[t] = detail ? formatInr(detail.incomeTypeTotals.find(x => x.incomeType === t)?.totalNet ?? 0) : '';
    }
    row['totalNet'] = detail ? formatInr(detail.totalNet) : '';
    row['business'] = detail ? formatInr(detail.totalBusiness) : '';
    row['tripExpense'] = detail ? formatInr(detail.tripExpense) : '';
    // Commission = gross ledger income (before TDS/admin deductions) + trip expense.
    const commissionExpense = detail ? detail.totalGross + detail.tripExpense : 0;
    row['commissionExpense'] = detail ? formatInr(commissionExpense) : '';
    row['commissionPct'] =
      detail && detail.totalBusiness > 0 ? ((commissionExpense / detail.totalBusiness) * 100).toFixed(2) + '%' : '—';
    return row;
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

  // Amber for the two not-yet-settled states, green once closed (the final state -- payment is
  // tracked per income entry, not on the cycle) -- same "share a tone across related statuses"
  // idiom Ledger Register/Payout Approval already use.
  statusBadgeTone(value: string | number): BadgeTone {
    switch (value) {
      case 'OPEN':
      case 'CALCULATING':
        return 'warning';
      case 'CLOSED':
        return 'success';
      default:
        return 'default';
    }
  }

  railStageLabelKey(stage: CycleStatus): string {
    const keys: Record<CycleStatus, string> = {
      OPEN: 'admin.cycleManagement.statusOpenOption',
      CALCULATING: 'admin.cycleManagement.statusCalculatingOption',
      CLOSED: 'admin.cycleManagement.statusClosedOption'
    };
    return keys[stage];
  }

  openCycle(): void {
    this.openError = null;
    this.cycleManagementService.open().subscribe({
      next: () => {
        this.loadPage(0);
        this.loadCurrentCycleStats();
      },
      error: (err: HttpErrorResponse) => {
        this.openError = err.error?.error || this.translate.instant('admin.cycleManagement.openGenericError');
      }
    });
  }

  closeCycle(): void {
    if (!this.currentOpenCycle) {
      return;
    }
    this.closeError = null;
    this.cycleManagementService.close(this.currentOpenCycle.id).subscribe({
      next: result => {
        this.closeResult = result;
      },
      error: (err: HttpErrorResponse) => {
        this.closeResult = null;
        this.closeError = err.error?.error || this.translate.instant('admin.cycleManagement.closeGenericError');
      }
    });
  }

  // Closing the popup reloads the screen's data so the newly opened cycle shows up.
  dismissClosePopup(): void {
    const reload = !!this.closeResult;
    this.closeResult = null;
    this.closeError = null;
    if (reload) {
      this.loadPage(0);
      this.loadCurrentCycleStats();
    }
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
