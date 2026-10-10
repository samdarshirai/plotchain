import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IncomeStatementService } from './income-statement.service';
import { AssociateLedgerPage, AssociateLedgerFilters } from './models/associate-ledger-page.model';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;
const CYCLE_LOOKUP_SIZE = 100;

const TAB_ROUTES = [
  { id: 'ALL', labelKey: 'incomeStatement.tabAll', path: '/income-statement' },
  { id: 'DIRECT', labelKey: 'incomeStatement.tabDirect', path: '/income-statement/direct' },
  { id: 'MATCHING', labelKey: 'incomeStatement.tabMatching', path: '/income-statement/matching' },
  { id: 'SPONSOR_MATCHING', labelKey: 'incomeStatement.tabSponsorMatching', path: '/income-statement/sponsor-matching' },
  { id: 'ROYALTY', labelKey: 'incomeStatement.tabRoyalty', path: '/income-statement/royalty' },
  { id: 'REWARD', labelKey: 'incomeStatement.tabReward', path: '/income-statement/reward' },
  { id: 'PERK', labelKey: 'incomeStatement.tabPerk', path: '/income-statement/perk' }
];

const MATCHING_KEYS = ['bflb', 'bfrb', 'nlb', 'nrb', 'tlb', 'trb', 'clb', 'crb'];

export interface CycleOption {
  cycleId: string;
  cyclePeriodStart: string;
  cyclePeriodEnd: string;
}

@Component({
  selector: 'app-income-statement',
  standalone: true,
  imports: [CommonModule, TranslateModule, TabBarComponent, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="income-statement" [class.income-statement--matching]="activeIncomeType === 'MATCHING'">
      <div class="income-statement__intro">
        <h1 class="income-statement__title">{{ 'incomeStatement.title' | translate }}</h1>
        <p class="income-statement__subtitle">{{ 'incomeStatement.subtitle' | translate }}</p>
      </div>

      <div class="income-statement__tabs">
        <app-tab-bar [tabs]="tabs" [activeTabId]="activeIncomeType" (tabChange)="onTabChange($event)"></app-tab-bar>
      </div>

      <dl class="income-statement__legend" *ngIf="activeIncomeType === 'MATCHING'">
        <div *ngFor="let key of legendKeys"><dt>{{ 'incomeStatement.' + key + 'Abbr' | translate }}</dt><dd>{{ 'incomeStatement.' + key + 'Legend' | translate }}</dd></div>
      </dl>

      <div class="income-statement__filters">
        <div class="income-statement__filter-field">
          <label>
            {{ 'incomeStatement.cycleFilterLabel' | translate }}
            <select (change)="onCycleIdChange($any($event.target).value)">
              <option value="">{{ 'incomeStatement.cycleFilterAllOption' | translate }}</option>
              <option *ngFor="let cycle of cycles" [value]="cycle.cycleId">
                {{ datePipe.transform(cycle.cyclePeriodStart, 'mediumDate') }} – {{ datePipe.transform(cycle.cyclePeriodEnd, 'mediumDate') }}
              </option>
            </select>
          </label>
        </div>
        <div class="income-statement__filter-field">
          <label>
            {{ 'incomeStatement.statusFilterLabel' | translate }}
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'incomeStatement.statusFilterAllOption' | translate }}</option>
              <option value="PENDING">{{ 'incomeStatement.statusPendingOption' | translate }}</option>
              <option value="CARRIED_FORWARD">{{ 'incomeStatement.statusCarriedForwardOption' | translate }}</option>
              <option value="PAID">{{ 'incomeStatement.statusPaidOption' | translate }}</option>
              <option value="REVERSED">{{ 'incomeStatement.statusReversedOption' | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="income-statement__load-error">
        {{ 'incomeStatement.loadError' | translate }}
      </app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="statementColumns"
          [rows]="statementRows"
          [emptyStateLabel]="'incomeStatement.emptyState' | translate"
        ></app-editable-table>
      </div>

      <div class="income-statement__pagination" *ngIf="page">
        <span class="income-statement__page-indicator">
          {{ 'incomeStatement.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'incomeStatement.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'incomeStatement.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class IncomeStatementComponent implements OnInit, OnDestroy {
  private incomeStatementService = inject(IncomeStatementService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private currencyPipe = inject(CurrencyPipe);
  protected datePipe = inject(DatePipe);
  private destroyed$ = new Subject<void>();

  legendKeys = ['bflb', 'nlb', 'tlb', 'clb', 'bfrb', 'nrb', 'trb', 'crb'];

  page: AssociateLedgerPage | null = null;
  loadError = false;
  cycles: CycleOption[] = [];
  activeIncomeType = 'ALL';
  statementColumns: EditableTableColumn[] = [];
  statementRows: Record<string, string>[] = [];
  private cycleId = '';
  private status = '';

  get tabs(): TabDefinition[] {
    return TAB_ROUTES.map(t => ({ id: t.id, label: this.translate.instant(t.labelKey) }));
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
    // buildColumns() uses translate.get() (reactive) rather than instant() -- instant() only
    // resolves once the async translation file fetch (TranslateHttpLoader) completes, so a
    // synchronous instant() call here would bake in the raw i18n key. onLangChange keeps the
    // columns in sync if the user switches languages after initial load.
    this.buildColumns();
    this.translate.onLangChange.pipe(takeUntil(this.destroyed$)).subscribe(() => this.buildColumns());
    this.loadCycleOptions();
    // Angular reuses this instance across the sibling /income-statement/* routes (see
    // app.routes.ts), so data must be subscribed to, not read once. Fires on init too.
    this.route.data.pipe(takeUntil(this.destroyed$)).subscribe(data => {
      this.activeIncomeType = (data['incomeType'] as string) ?? 'ALL';
      this.buildColumns();
      this.loadPage(0);
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  private buildColumns(): void {
    if (this.activeIncomeType === 'MATCHING') {
      this.buildMatchingColumns();
      return;
    }
    this.translate
      .get([
        'incomeStatement.columnIncomeType',
        'incomeStatement.columnCyclePeriod',
        'incomeStatement.columnStatus',
        'incomeStatement.columnGrossAmount',
        'incomeStatement.columnTdsDeduction',
        'incomeStatement.columnAdminDeduction',
        'incomeStatement.columnNetAmount',
        'incomeStatement.columnSourceRef',
        'incomeStatement.columnCreatedAt'
      ])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.statementColumns = [
          { key: 'incomeType', label: t['incomeStatement.columnIncomeType'], type: 'text' },
          { key: 'cyclePeriod', label: t['incomeStatement.columnCyclePeriod'], type: 'text' },
          { key: 'status', label: t['incomeStatement.columnStatus'], type: 'text' },
          { key: 'grossAmount', label: t['incomeStatement.columnGrossAmount'], type: 'text' },
          { key: 'tdsDeduction', label: t['incomeStatement.columnTdsDeduction'], type: 'text' },
          { key: 'adminDeduction', label: t['incomeStatement.columnAdminDeduction'], type: 'text' },
          { key: 'netAmount', label: t['incomeStatement.columnNetAmount'], type: 'text' },
          { key: 'sourceRef', label: t['incomeStatement.columnSourceRef'], type: 'text' },
          { key: 'createdAt', label: t['incomeStatement.columnCreatedAt'], type: 'text' }
        ];
      });
  }

  private buildMatchingColumns(): void {
    const keys = ['columnSerial', 'columnPeriod', ...MATCHING_KEYS.map(k => k + 'Abbr'), 'columnMatchingBusiness', 'columnMatchingIncome']
      .map(k => 'incomeStatement.' + k);
    this.translate
      .get(keys)
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        const cols = ['sn', 'period', ...MATCHING_KEYS, 'matchingBusiness', 'matchingIncome'];
        this.statementColumns = cols.map((key, i) => ({ key, label: t[keys[i]], type: 'text' as const }));
      });
  }

  // Each tab is its own route (see app.routes.ts), so tabs stay deep-linkable.
  onTabChange(id: string): void {
    this.router.navigateByUrl(TAB_ROUTES.find(t => t.id === id)?.path ?? '/income-statement');
  }

  onCycleIdChange(value: string): void {
    this.cycleId = value;
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  // Design Decision 1 (see plan header): a dedicated, unfiltered, one-time lookup -- independent
  // of the main filtered/paginated load below -- so the cycle dropdown's option list doesn't
  // shift as the user changes tabs/filters. A lookup failure only degrades this dropdown to its
  // "All cycles" option; it never sets loadError, since it doesn't block the itemized table.
  private loadCycleOptions(): void {
    this.incomeStatementService.list({}, 0, CYCLE_LOOKUP_SIZE).subscribe({
      next: res => {
        const byCycleId = new Map<string, CycleOption>();
        for (const entry of res.entries) {
          if (!entry.cyclePeriodStart || !entry.cyclePeriodEnd) {
            continue;
          }
          if (!byCycleId.has(entry.cycleId)) {
            byCycleId.set(entry.cycleId, {
              cycleId: entry.cycleId,
              cyclePeriodStart: entry.cyclePeriodStart,
              cyclePeriodEnd: entry.cyclePeriodEnd
            });
          }
        }
        this.cycles = Array.from(byCycleId.values()).sort((a, b) => b.cyclePeriodStart.localeCompare(a.cyclePeriodStart));
      },
      error: () => {
        this.cycles = [];
      }
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    const filters: AssociateLedgerFilters = {};
    if (this.activeIncomeType !== 'ALL') {
      filters.incomeType = this.activeIncomeType as AssociateLedgerFilters['incomeType'];
    }
    if (this.cycleId) {
      filters.cycleId = this.cycleId;
    }
    if (this.status) {
      filters.status = this.status as AssociateLedgerFilters['status'];
    }
    this.incomeStatementService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  // Payslip-ladder money formatting (design follow-up, see
  // docs/design/associate_operational_screens/income_statement/DESIGN.md's currency-formatting
  // note): all four money columns are real INR-formatted currency, not raw numbers, and the two
  // deduction columns carry a literal leading minus sign in the mapped string itself -- not a
  // CSS-only ::before -- since the value should carry its own sign rather than relying on CSS to
  // imply arithmetic the data doesn't literally contain.
  private formatCurrency(amount: number): string {
    return this.currencyPipe.transform(amount, 'INR', 'symbol', '1.0-2') ?? String(amount);
  }

  private formatDeduction(amount: number): string {
    return `−${this.formatCurrency(amount)}`;
  }

  private updateMatchingRows(): void {
    const offset = (this.page?.page ?? 0) * (this.page?.size ?? 0);
    const n = (v: number | undefined) => String(v ?? 0);
    this.statementRows = (this.page?.entries ?? []).map((entry, i) => {
      const b = entry.legBreakdown;
      return {
        sn: String(offset + i + 1),
        period: `${this.datePipe.transform(entry.cyclePeriodStart, 'dd-MM-yyyy')} / ${this.datePipe.transform(entry.cyclePeriodEnd, 'dd-MM-yyyy')}`,
        bflb: n(b?.bfLeft),
        bfrb: n(b?.bfRight),
        nlb: n(b?.newLeft),
        nrb: n(b?.newRight),
        tlb: n(b?.totalLeft),
        trb: n(b?.totalRight),
        clb: n(b?.calcLeft),
        crb: n(b?.calcRight),
        matchingBusiness: n(b?.matchingBusiness),
        matchingIncome: n(entry.grossAmount)
      };
    });
  }

  private updateTableRows(): void {
    if (this.activeIncomeType === 'MATCHING') {
      this.updateMatchingRows();
      return;
    }
    this.statementRows = (this.page?.entries ?? []).map(entry => ({
      incomeType: entry.incomeType,
      cyclePeriod: `${this.datePipe.transform(entry.cyclePeriodStart, 'mediumDate')} – ${this.datePipe.transform(entry.cyclePeriodEnd, 'mediumDate')}`,
      status: entry.status,
      grossAmount: this.formatCurrency(entry.grossAmount),
      tdsDeduction: this.formatDeduction(entry.tdsDeduction),
      adminDeduction: this.formatDeduction(entry.adminDeduction),
      netAmount: this.formatCurrency(entry.netAmount),
      sourceRef: entry.sourceRef ?? this.translate.instant('incomeStatement.noSourceRef'),
      createdAt: this.datePipe.transform(entry.createdAt, 'medium') ?? entry.createdAt
    }));
  }
}
