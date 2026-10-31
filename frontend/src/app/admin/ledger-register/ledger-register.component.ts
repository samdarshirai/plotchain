import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LedgerRegisterService } from './ledger-register.service';
import { AdminLedgerPage, AdminLedgerFilters } from '../models/admin-ledger-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { CycleManagementService } from '../cycle-management/cycle-management.service';
import { CycleSummary } from '../models/cycle.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { AdminLedgerEntry } from '../models/ledger-entry.model';
import { AdminLedgerSummaryPage, AdminLedgerSummaryRow } from '../models/ledger-summary.model';

const PAGE_SIZE = 20;
const CYCLE_LOOKUP_SIZE = 100;
const DATE_FORMAT = 'dd MMM yyyy';
const DATE_TIME_FORMAT = 'dd MMM yyyy, HH:mm';
const MATCHING_KEYS = ['bflb', 'bfrb', 'nlb', 'nrb', 'tlb', 'trb', 'clb', 'crb'];

// One column of the per-income-type layout. Labels reuse the associate Income Statement's i18n
// keys so both screens read the same.
interface ColumnSpec {
  key: string;
  labelKey: string;
  badge?: boolean;
  value: (e: AdminLedgerEntry) => string;
}

const INCOME_TYPE_TABS = [
  { id: 'SUMMARY', labelKey: 'admin.ledgerRegister.summaryTab' },
  { id: '', labelKey: 'admin.ledgerRegister.incomeTypeFilterAllOption' },
  { id: 'DIRECT', labelKey: 'admin.ledgerRegister.incomeTypeDirectOption' },
  { id: 'MATCHING', labelKey: 'admin.ledgerRegister.incomeTypeMatchingOption' },
  { id: 'SPONSOR_MATCHING', labelKey: 'admin.ledgerRegister.incomeTypeSponsorMatchingOption' },
  { id: 'ROYALTY', labelKey: 'admin.ledgerRegister.incomeTypeRoyaltyOption' },
  { id: 'REWARD', labelKey: 'admin.ledgerRegister.incomeTypeRewardOption' }
];

const SUMMARY_TYPES = [
  { type: 'DIRECT', labelKey: 'incomeStatement.columnDirectIncome' },
  { type: 'MATCHING', labelKey: 'incomeStatement.columnMatchingIncome' },
  { type: 'SPONSOR_MATCHING', labelKey: 'incomeStatement.columnSponsorMatchingIncome' },
  { type: 'ROYALTY', labelKey: 'incomeStatement.columnRoyaltyBonus' },
  { type: 'REWARD', labelKey: 'incomeStatement.columnReward' }
];

const LEG_FIELD: Record<string, string> = {
  bflb: 'bfLeft', bfrb: 'bfRight', nlb: 'newLeft', nrb: 'newRight',
  tlb: 'totalLeft', trb: 'totalRight', clb: 'calcLeft', crb: 'calcRight'
};

@Component({
  selector: 'app-ledger-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, EditableTableComponent, InlineBannerComponent, TabBarComponent, FieldErrorComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="ledger-register">
      <div class="ledger-register__intro">
        <span class="ledger-register__eyebrow">{{ 'admin.ledgerRegister.eyebrow' | translate }}</span>
        <h1 class="ledger-register__title">{{ 'admin.ledgerRegister.title' | translate }}</h1>
        <p class="ledger-register__subtitle">{{ 'admin.ledgerRegister.subtitle' | translate }}</p>
      </div>

      <div class="ledger-register__tabs">
        <app-tab-bar [tabs]="tabs" [activeTabId]="incomeType" (tabChange)="onIncomeTypeChange($event)"></app-tab-bar>
      </div>

      <div class="ledger-register__filters">
        <div class="ledger-register__filter-field">
          <label>
            {{ 'admin.ledgerRegister.associateFilterLabel' | translate }}
            <select (change)="onAssociateIdChange($any($event.target).value)">
              <option value="">{{ 'admin.ledgerRegister.associateFilterAllOption' | translate }}</option>
              <option *ngFor="let associate of associates" [value]="associate.id">
                {{ associate.userId }} — {{ associate.name }}
              </option>
            </select>
          </label>
        </div>
        <div class="ledger-register__filter-field">
          <label>
            {{ 'admin.ledgerRegister.cycleFilterLabel' | translate }}
            <select (change)="onCycleIdChange($any($event.target).value)">
              <option value="">{{ 'admin.ledgerRegister.cycleFilterAllOption' | translate }}</option>
              <option *ngFor="let cycle of cycles" [value]="cycle.id" [selected]="cycle.id === cycleId">
                {{ datePipe.transform(cycle.periodStart, 'mediumDate') }} – {{ datePipe.transform(cycle.periodEnd, 'mediumDate') }}
              </option>
            </select>
          </label>
        </div>
        <div class="ledger-register__filter-field" *ngIf="!isSummary">
          <label>
            {{ 'admin.ledgerRegister.statusFilterLabel' | translate }}
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'admin.ledgerRegister.statusFilterAllOption' | translate }}</option>
              <option value="PENDING">{{ 'admin.ledgerRegister.statusPendingOption' | translate }}</option>
              <option value="CARRIED_FORWARD">{{ 'admin.ledgerRegister.statusCarriedForwardOption' | translate }}</option>
              <option value="PAID">{{ 'admin.ledgerRegister.statusPaidOption' | translate }}</option>
              <option value="REVERSED">{{ 'admin.ledgerRegister.statusReversedOption' | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="ledger-register__load-error">
        {{ 'admin.ledgerRegister.loadError' | translate }}
      </app-inline-banner>

      <div class="ledger-register__toolbar">
        <button type="button" class="brand-button" [disabled]="selectedIds.length === 0" (click)="openFulfil(selectedIds)">
          {{ 'admin.ledgerRegister.markPaidAction' | translate }} ({{ selectedIds.length }})
        </button>
      </div>

      <dl class="income-statement__legend" *ngIf="incomeType === 'MATCHING'">
        <div *ngFor="let key of legendKeys"><dt>{{ 'incomeStatement.' + key + 'Abbr' | translate }}</dt><dd>{{ 'incomeStatement.' + key + 'Legend' | translate }}</dd></div>
      </dl>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [selectable]="true"
          [selectedIds]="selectedIds"
          (selectionChange)="selectedIds = $event"
          [columns]="registerColumns"
          [rows]="registerRows"
          [actionTemplate]="editCell"
          [emptyStateLabel]="'admin.ledgerRegister.emptyState' | translate"
        ></app-editable-table>
        <ng-template #editCell let-row>
          <button type="button" class="brand-button brand-button--secondary" (click)="openEdit(row)">
            {{ 'admin.ledgerRegister.editAction' | translate }}
          </button>
        </ng-template>
      </div>

      <form class="card ledger-register__fulfil" *ngIf="fulfilIds.length" [class.was-submitted]="fulfilTried" (ngSubmit)="saveFulfil()" novalidate>
        <label>
          {{ 'admin.ledgerRegister.fulfilDateLabel' | translate }}
          <input type="date" name="fulfilDate" [(ngModel)]="fulfilDate" required [attr.aria-invalid]="fulfilTried && !fulfilDate ? 'true' : null" />
          <app-field-error [message]="fulfilTried && !fulfilDate ? 'Payment date is required. Pick the date the payment was made.' : undefined"></app-field-error>
        </label>
        <label>
          {{ 'admin.ledgerRegister.fulfilRemarkLabel' | translate }}
          <input type="text" name="fulfilRemark" [(ngModel)]="fulfilRemark" maxlength="500" />
        </label>
        <app-inline-banner *ngIf="fulfilError" tone="danger">{{ 'admin.ledgerRegister.fulfilError' | translate }}</app-inline-banner>
        <button type="submit" class="brand-button">{{ 'admin.ledgerRegister.fulfilSaveAction' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" (click)="fulfilIds = []">{{ 'admin.ledgerRegister.fulfilCancelAction' | translate }}</button>
      </form>

      <div class="ledger-register__pagination" *ngIf="page">
        <span class="ledger-register__page-indicator">
          {{ 'admin.ledgerRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.ledgerRegister.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.ledgerRegister.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class LedgerRegisterComponent implements OnInit {
  private ledgerRegisterService = inject(LedgerRegisterService);
  private adminService = inject(AdminService);
  private cycleManagementService = inject(CycleManagementService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  protected datePipe = inject(DatePipe);

  page: AdminLedgerPage | null = null;
  loadError = false;
  associates: AssociateSummary[] = [];
  cycles: CycleSummary[] = [];
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  private associateId = '';
  incomeType = '';
  cycleId = '';
  private status = '';
  private summaryPage: AdminLedgerSummaryPage | null = null;
  legendKeys = ['bflb', 'nlb', 'tlb', 'clb', 'bfrb', 'nrb', 'trb', 'crb'];
  selectedIds: string[] = [];
  fulfilIds: string[] = [];
  fulfilDate = '';
  fulfilRemark = '';
  fulfilError = false;
  fulfilTried = false;

  get isSummary(): boolean {
    return this.incomeType === 'SUMMARY';
  }

  get tabs(): TabDefinition[] {
    return INCOME_TYPE_TABS.map(t => ({ id: t.id, label: this.translate.instant(t.labelKey) }));
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
    this.registerColumns = this.buildColumns();
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    // Default the cycle filter to the most recent cycle; first page loads once that's known.
    this.cycleManagementService.list('', 0, CYCLE_LOOKUP_SIZE).subscribe({
      next: res => {
        this.cycles = res.cycles;
        this.cycleId = res.cycles.reduce<CycleSummary | null>((a, c) => (!a || c.periodStart > a.periodStart ? c : a), null)?.id ?? '';
        this.loadPage(0);
      },
      error: () => this.loadPage(0)
    });
  }

  private fmtDate(value: string | null | undefined, format = DATE_FORMAT): string {
    return (value && this.datePipe.transform(value, format)) || '';
  }

  private money(amount: number): string {
    return this.currencyPipe.transform(amount, 'INR', 'symbol', '1.2-2') ?? String(amount);
  }

  private cyclePeriod(e: AdminLedgerEntry): string {
    return `${this.fmtDate(e.cyclePeriodStart)} – ${this.fmtDate(e.cyclePeriodEnd)}`;
  }

  // Per-income-type layout, mirroring the associate Income Statement (income-statement.component.ts).
  private specsFor(type: string): ColumnSpec[] {
    const n = (v: number | undefined | null) => String(v ?? 0);
    const text = (key: string, labelKey: string, value: ColumnSpec['value']): ColumnSpec => ({ key, labelKey, value });
    switch (type) {
      case 'DIRECT':
        return [
          text('dateTime', 'DateTime', e => this.fmtDate(e.createdAt, DATE_TIME_FORMAT)),
          text('amount', 'Amount', e => this.money(e.grossAmount)),
          text('directIncome', 'DirectIncome', e => this.money(e.grossAmount))
        ];
      case 'MATCHING':
        return [
          text('period', 'Period', e => this.cyclePeriod(e)),
          ...MATCHING_KEYS.map(k => text(k, k + 'Abbr', e => n((e.legBreakdown as any)?.[LEG_FIELD[k]]))),
          text('matchingBusiness', 'MatchingBusiness', e => n(e.legBreakdown?.matchingBusiness)),
          text('matchingIncome', 'MatchingIncome', e => this.money(e.grossAmount))
        ];
      case 'SPONSOR_MATCHING':
        return [
          text('date', 'Date', e => this.fmtDate(e.createdAt, DATE_TIME_FORMAT)),
          text('memberId', 'MemberId', e => e.sponseeUserId ?? ''),
          text('matchingIncome', 'MatchingIncome', e => (e.sponseeMatchingAmount == null ? '' : this.money(e.sponseeMatchingAmount))),
          text('sponsorMatchingIncome', 'SponsorMatchingIncome', e => this.money(e.grossAmount))
        ];
      case 'ROYALTY':
        return [
          text('date', 'Date', e => this.cyclePeriod(e)),
          text('newLeft', 'NewLeftBusiness', e => n(e.legBreakdown?.newLeft)),
          text('newRight', 'NewRightBusiness', e => n(e.legBreakdown?.newRight)),
          text('newMatching', 'NewMatchingBusiness', e => n(e.legBreakdown?.matchingBusiness)),
          text('royaltyBonus', 'RoyaltyBonus', e => this.money(e.grossAmount))
        ];
      case 'REWARD':
        return [
          text('achievedDate', 'AchievedDate', e => this.fmtDate(e.createdAt)),
          text('reward', 'Reward', e => this.money(e.grossAmount))
        ];
      default:
        return [
          text('incomeType', 'IncomeType', e => e.incomeType),
          text('cyclePeriod', 'CyclePeriod', e => this.cyclePeriod(e)),
          { key: 'status', labelKey: 'Status', badge: true, value: e => e.status },
          text('grossAmount', 'GrossAmount', e => this.money(e.grossAmount)),
          text('createdAt', 'CreatedAt', e => this.fmtDate(e.createdAt, DATE_TIME_FORMAT))
        ];
    }
  }

  // Associate ID + Name first, then the associate-style columns, then payment tracking.
  private allSpecs(): ColumnSpec[] {
    return [
      { key: 'associateId', labelKey: 'AssociateId', value: e => e.associateUserId },
      { key: 'name', labelKey: 'AssociateName', value: e => e.associateName },
      ...this.specsFor(this.incomeType),
      { key: 'payStatus', labelKey: 'PayStatus', value: e => this.translate.instant(e.fulfilledAt ? 'incomeStatement.payStatusPaid' : 'incomeStatement.payStatusUnpaid') },
      { key: 'paymentDate', labelKey: 'PaymentDate', value: e => this.fmtDate(e.fulfilledAt) },
      { key: 'remarks', labelKey: 'Remarks', value: e => e.fulfilmentRemark ?? '' }
    ];
  }

  private buildSummaryColumns(): EditableTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    const text = (key: string, label: string): EditableTableColumn => ({ key, label, type: 'text' });
    return [
      text('associateId', t('incomeStatement.columnAssociateId')),
      text('name', t('incomeStatement.columnAssociateName')),
      text('cyclePeriod', t('incomeStatement.columnCyclePeriod')),
      ...SUMMARY_TYPES.map(c => text(c.type, t(c.labelKey))),
      text('totalGross', t('admin.ledgerRegister.columnTotalIncome')),
      text('tds', t('incomeStatement.columnTdsDeduction')),
      text('adminCharges', t('admin.ledgerRegister.columnAdminCharges')),
      text('totalNet', t('admin.ledgerRegister.columnNetIncome')),
      { key: 'payStatus', label: t('incomeStatement.columnPayStatus'), type: 'badge', badgeTone: v => (v === t('incomeStatement.payStatusPaid') ? 'success' : 'warning') }
    ];
  }

  private buildColumns(): EditableTableColumn[] {
    if (this.isSummary) return this.buildSummaryColumns();
    const columns: EditableTableColumn[] = this.allSpecs().map(c => ({
      key: c.key,
      label: this.translate.instant('incomeStatement.' + (c.labelKey.endsWith('Abbr') ? c.labelKey : 'column' + c.labelKey)),
      type: c.badge ? 'badge' : 'text',
      ...(c.badge ? { badgeTone: (v: string | number) => this.statusBadgeTone(v) } : {})
    }));
    if (this.incomeType === 'REWARD') {
      columns.push({ key: 'edit', label: this.translate.instant('admin.ledgerRegister.columnFulfilment'), type: 'action' });
    }
    return columns;
  }

  onAssociateIdChange(value: string): void {
    this.associateId = value;
    this.loadPage(0);
  }

  onIncomeTypeChange(value: string): void {
    this.incomeType = value;
    this.fulfilIds = [];
    this.selectedIds = [];
    this.registerColumns = this.buildColumns();
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

  openFulfil(ids: string[], date = '', remark = ''): void {
    this.fulfilIds = ids;
    this.fulfilDate = date || new Date().toISOString().slice(0, 10);
    this.fulfilRemark = remark;
    this.fulfilError = false;
    this.fulfilTried = false;
  }

  openEdit(row: Record<string, string>): void {
    this.openFulfil([row['id']], row['fulfilledDate'], row['remarkRaw']);
  }

  saveFulfil(): void {
    this.fulfilTried = true;
    if (!this.fulfilDate) {
      return;
    }
    const paidAt = new Date(this.fulfilDate).toISOString();
    // Summary rows are keyed "associateId|cycleId" (see updateSummaryRows).
    const save$ = this.isSummary
      ? this.ledgerRegisterService.markSummaryPaid(
          this.fulfilIds.map(id => {
            const [associateId, cycleId] = id.split('|');
            return { associateId, cycleId };
          }),
          paidAt,
          this.fulfilRemark
        )
      : this.ledgerRegisterService.markPaid(this.fulfilIds, paidAt, this.fulfilRemark);
    save$.subscribe({
      next: () => {
        this.fulfilIds = [];
        this.selectedIds = [];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.fulfilError = true)
    });
  }

  goToPage(page: number): void {
    this.selectedIds = [];
    this.loadPage(page);
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    if (this.isSummary) {
      this.ledgerRegisterService.summary(this.associateId, this.cycleId, page, PAGE_SIZE).subscribe({
        next: res => {
          this.summaryPage = res;
          // Shared pagination footer reads page/size/totalElements only.
          this.page = { entries: [], page: res.page, size: res.size, totalElements: res.totalElements };
          this.updateSummaryRows();
        },
        error: () => (this.loadError = true)
      });
      return;
    }
    const filters: AdminLedgerFilters = {};
    if (this.associateId) filters.associateId = this.associateId;
    if (this.incomeType) filters.incomeType = this.incomeType as AdminLedgerFilters['incomeType'];
    if (this.cycleId) filters.cycleId = this.cycleId;
    if (this.status) filters.status = this.status as AdminLedgerFilters['status'];
    this.ledgerRegisterService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private paySummary(r: AdminLedgerSummaryRow): string {
    const key = r.paidCount >= r.entryCount ? 'incomeStatement.payStatusPaid' : r.paidCount === 0 ? 'incomeStatement.payStatusUnpaid' : 'admin.ledgerRegister.partlyPaid';
    return this.translate.instant(key);
  }

  private updateSummaryRows(): void {
    this.registerRows = (this.summaryPage?.rows ?? []).map(r => {
      const row: Record<string, string> = {
        id: `${r.associateId}|${r.cycleId}`,
        associateId: r.associateUserId ?? '',
        name: r.associateName ?? '',
        cyclePeriod: `${this.fmtDate(r.cyclePeriodStart)} – ${this.fmtDate(r.cyclePeriodEnd)}`,
        totalGross: this.money(r.totalGross),
        tds: this.money(r.tds),
        adminCharges: this.money(r.adminCharges),
        totalNet: this.money(r.totalNet),
        payStatus: this.paySummary(r)
      };
      for (const c of SUMMARY_TYPES) row[c.type] = this.money(r.gross[c.type as keyof typeof r.gross] ?? 0);
      return row;
    });
  }

  private updateTableRows(): void {
    const specs = this.allSpecs();
    this.registerRows = (this.page?.entries ?? []).map(entry => {
      const row: Record<string, string> = {
        id: entry.id,
        fulfilledDate: entry.fulfilledAt ? entry.fulfilledAt.slice(0, 10) : '',
        remarkRaw: entry.fulfilmentRemark ?? ''
      };
      for (const c of specs) row[c.key] = c.value(entry);
      return row;
    });
  }

  statusBadgeTone(value: string | number): BadgeTone {
    return value === 'PAID' ? 'success' : value === 'REVERSED' ? 'danger' : 'warning';
  }
}
