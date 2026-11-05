import { Component, OnInit, inject } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { fetchAllPages } from '../../shared/utils/fetch-all-pages';

const INCOME_TYPES: CycleIncomeType[] = ['DIRECT', 'MATCHING', 'SPONSOR_MATCHING', 'ROYALTY', 'REWARD'];
// Key order = table order; 'totalGross' sits between ROYALTY and REWARD, so the loop below can't be a single map.
const COLUMN_KEYS = [
  'DIRECT', 'MATCHING', 'SPONSOR_MATCHING', 'ROYALTY', 'totalGross', 'REWARD'
];
const COLUMN_LABEL_KEYS: Record<string, string> = {
  DIRECT: 'columnDirect', MATCHING: 'columnMatching', SPONSOR_MATCHING: 'columnSponsor',
  ROYALTY: 'columnRoyalty', totalGross: 'columnTotalIncome', REWARD: 'columnReward'
};

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
        <p class="cycle-management__income-note">{{ 'admin.cycleManagement.grossIncomeNote' | translate }}</p>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <section class="cycle-management__current" *ngIf="currentOpenCycle as open">
        <div class="cycle-management__current-head">
          <div class="cycle-management__current-meta">
            <span class="cycle-management__current-eyebrow">{{ 'admin.cycleManagement.currentCycleTitle' | translate }}</span>
            <span class="cycle-management__current-period">{{ open.periodStart }} – {{ open.periodEnd || ('admin.cycleManagement.ongoing' | translate) }}</span>
            <ng-container *ngTemplateOutlet="cycleRailTpl; context: { status: open.status }"></ng-container>
          </div>
          <ng-container *ngIf="currentCycleStats as stats">
          <div class="cycle-progress">
            <span class="cycle-progress__label">{{ daysElapsed }} {{ 'admin.cycleManagement.daysElapsedLabel' | translate }}</span>
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
              <span class="cycle-metric__value">{{ stats.totalGrossIncome | currency:'INR':'symbol':'1.0-0' }}</span>
              <span class="cycle-metric__delta" *ngIf="incomeDelta !== null" [class.cycle-metric__delta--down]="incomeDelta < 0">
                {{ incomeDelta >= 0 ? '▲' : '▼' }} {{ incomeDelta | number:'1.0-1' }}% {{ 'admin.cycleManagement.vsPreviousCycleLabel' | translate }}
              </span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.directIncomeLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.directGrossIncome | currency:'INR':'symbol':'1.0-0' }}</span>
            </div>
            <div class="cycle-metric">
              <span class="cycle-metric__label">{{ 'admin.cycleManagement.matchingIncomeLabel' | translate }}</span>
              <span class="cycle-metric__value">{{ stats.matchingGrossIncome | currency:'INR':'symbol':'1.0-0' }}</span>
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
              <span class="cycle-metric__value">{{ stats.revenueThisCycle | currency:'INR':'symbol':'1.0-0' }}</span>
            </div>
          </div>
        </ng-container>
      </section>

      <div class="cycle-popup__overlay" *ngIf="closeDialogOpen && currentOpenCycle as open">
        <form class="cycle-popup cycle-management__close-dialog" role="dialog" aria-modal="true" aria-labelledby="close-cycle-title" (ngSubmit)="confirmClose()">
          <h2 class="cycle-popup__title" id="close-cycle-title">{{ 'admin.cycleManagement.closeDialogTitle' | translate }}</h2>
          <p>{{ 'admin.cycleManagement.closeDialogHelp' | translate }}</p>
          <label class="cycle-management__end-date">
            {{ 'admin.cycleManagement.endDateLabel' | translate }}
            <input type="date" name="endDate" required [(ngModel)]="closeEndDate" [min]="open.periodStart" [max]="today" />
          </label>
          <div class="cycle-popup__footer">
            <button type="button" class="brand-button brand-button--secondary" (click)="closeDialogOpen = false">{{ 'admin.cycleManagement.closeDialogCancel' | translate }}</button>
            <button type="submit" class="brand-button cycle-management__confirm-close" [disabled]="!closeEndDate || closeEndDate < open.periodStart || closeEndDate > today">{{ 'admin.cycleManagement.closeDialogConfirm' | translate }}</button>
          </div>
        </form>
      </div>

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
  closeDialogOpen = false;
  closeEndDate = '';
  readonly today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
  openError: string | null = null;
  creditResult: WalletCreditingResult | null = null;
  creditError: 'conflict' | 'generic' | null = null;
  private status: CycleStatus | '' = '';

  // Cycles have no fixed length: just how many days the open cycle has been running (start day = day 1).
  get daysElapsed(): number {
    const start = this.currentCycleStats?.periodStart;
    return start ? Math.floor((new Date(this.today).getTime() - new Date(start).getTime()) / 86400000) + 1 : 0;
  }

  // % change of total income vs the previous cycle; null when there's nothing to compare against.
  get incomeDelta(): number | null {
    const stats = this.currentCycleStats;
    return stats?.previousCycleTotalGrossIncome ? ((stats.totalGrossIncome - stats.previousCycleTotalGrossIncome) / stats.previousCycleTotalGrossIncome) * 100 : null;
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
      { key: 'business', label: this.translate.instant('admin.cycleManagement.columnBusiness'), type: 'text', sum: true },
      ...COLUMN_KEYS.map(k => ({
        key: k,
        label: this.translate.instant('admin.cycleManagement.' + COLUMN_LABEL_KEYS[k]),
        type: 'text' as const,
        sum: true
      })),
      { key: 'tripExpense', label: this.translate.instant('admin.cycleManagement.columnTripExpense'), type: 'text', sum: true },
      { key: 'commissionExpense', label: this.translate.instant('admin.cycleManagement.columnCommissionExpense'), type: 'text', sum: true },
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

  protected loadPage(page: number): void {
    this.loadError = false;
    fetchAllPages((p, size) => this.cycleManagementService.list(this.status, p, size)).subscribe({
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
      period: `${cycle.periodStart} – ${cycle.periodEnd ?? this.translate.instant('admin.cycleManagement.ongoing')}`,
      status: cycle.status
    };
    for (const t of INCOME_TYPES) {
      row[t] = detail ? formatInr(detail.incomeTypeTotals.find(x => x.incomeType === t)?.totalGross ?? 0) : '';
    }
    row['totalGross'] = detail ? formatInr(detail.totalGross) : '';
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

  // Opens the end-date dialog (default today); confirmClose() does the actual call.
  closeCycle(): void {
    if (!this.currentOpenCycle) {
      return;
    }
    this.closeEndDate = this.today;
    this.closeDialogOpen = true;
  }

  confirmClose(): void {
    if (!this.currentOpenCycle || !this.closeEndDate) {
      return;
    }
    this.closeError = null;
    this.closeDialogOpen = false;
    this.cycleManagementService.close(this.currentOpenCycle.id, this.closeEndDate).subscribe({
      next: result => {
        this.closeResult = result;
      },
      error: (err: HttpErrorResponse) => {
        this.closeResult = null;
        this.closeError = err.error?.error
          || this.translate.instant(err.status === 409 ? 'admin.cycleManagement.closeConflictError' : 'admin.cycleManagement.closeGenericError');
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
        this.loadPage(0);
      },
      error: (err: HttpErrorResponse) => {
        this.creditResult = null;
        this.creditError = err.status === 409 ? 'conflict' : 'generic';
      }
    });
  }
}
