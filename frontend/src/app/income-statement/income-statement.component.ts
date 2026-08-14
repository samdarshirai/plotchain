import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { IncomeStatementService } from './income-statement.service';
import { AssociateLedgerPage, AssociateLedgerFilters } from './models/associate-ledger-page.model';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;
const CYCLE_LOOKUP_SIZE = 100;

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
    <div class="income-statement">
      <div class="income-statement__intro">
        <h1 class="income-statement__title">{{ 'incomeStatement.title' | translate }}</h1>
        <p class="income-statement__subtitle">{{ 'incomeStatement.subtitle' | translate }}</p>
      </div>

      <div class="income-statement__tabs">
        <app-tab-bar [tabs]="tabs" [activeTabId]="activeIncomeType" (tabChange)="onTabChange($event)"></app-tab-bar>
      </div>

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
export class IncomeStatementComponent implements OnInit {
  private incomeStatementService = inject(IncomeStatementService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  protected datePipe = inject(DatePipe);

  page: AssociateLedgerPage | null = null;
  loadError = false;
  cycles: CycleOption[] = [];
  activeIncomeType = 'ALL';
  statementColumns: EditableTableColumn[] = [];
  statementRows: Record<string, string>[] = [];
  private cycleId = '';
  private status = '';

  get tabs(): TabDefinition[] {
    return [
      { id: 'ALL', label: this.translate.instant('incomeStatement.tabAll') },
      { id: 'DIRECT', label: this.translate.instant('incomeStatement.tabDirect') },
      { id: 'MATCHING', label: this.translate.instant('incomeStatement.tabMatching') },
      { id: 'SPONSOR_MATCHING', label: this.translate.instant('incomeStatement.tabSponsorMatching') },
      { id: 'ROYALTY', label: this.translate.instant('incomeStatement.tabRoyalty') },
      { id: 'REWARD', label: this.translate.instant('incomeStatement.tabReward') },
      { id: 'PERK', label: this.translate.instant('incomeStatement.tabPerk') }
    ];
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
    this.statementColumns = [
      { key: 'incomeType', label: this.translate.instant('incomeStatement.columnIncomeType'), type: 'text' },
      { key: 'cyclePeriod', label: this.translate.instant('incomeStatement.columnCyclePeriod'), type: 'text' },
      { key: 'status', label: this.translate.instant('incomeStatement.columnStatus'), type: 'text' },
      { key: 'grossAmount', label: this.translate.instant('incomeStatement.columnGrossAmount'), type: 'text' },
      { key: 'tdsDeduction', label: this.translate.instant('incomeStatement.columnTdsDeduction'), type: 'text' },
      { key: 'adminDeduction', label: this.translate.instant('incomeStatement.columnAdminDeduction'), type: 'text' },
      { key: 'netAmount', label: this.translate.instant('incomeStatement.columnNetAmount'), type: 'text' },
      { key: 'sourceRef', label: this.translate.instant('incomeStatement.columnSourceRef'), type: 'text' },
      { key: 'createdAt', label: this.translate.instant('incomeStatement.columnCreatedAt'), type: 'text' }
    ];
    this.loadCycleOptions();
    this.loadPage(0);
  }

  onTabChange(id: string): void {
    this.activeIncomeType = id;
    this.loadPage(0);
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

  private updateTableRows(): void {
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
