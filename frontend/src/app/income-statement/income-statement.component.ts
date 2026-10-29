import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AssociateProfileService } from '../profile-kyc/associate-profile.service';
import { AssociateProfileResponse } from '../profile-kyc/models/associate-profile.model';
import { IncomeStatementService } from './income-statement.service';
import { RewardTierRow } from './models/reward-tier-row.model';
import { AssociateLedgerPage, AssociateLedgerFilters } from './models/associate-ledger-page.model';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
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

const ledgerStatusTone = (value: string | number): BadgeTone =>
  value === 'PAID' ? 'success' : value === 'REVERSED' ? 'danger' : 'warning';

export interface CycleOption {
  cycleId: string;
  cyclePeriodStart: string;
  cyclePeriodEnd: string;
}

// One date style across every income-statement tab (Reward Statement design): "12 Aug 2026",
// date-times "12 Aug 2026, 14:32", ranges "01 Aug 2026 – 15 Aug 2026".
const DATE_FORMAT = 'dd MMM yyyy';
const DATE_TIME_FORMAT = 'dd MMM yyyy, HH:mm';

@Component({
  selector: 'app-income-statement',
  standalone: true,
  imports: [CommonModule, TranslateModule, TabBarComponent, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="income-statement" [attr.data-income-type]="activeIncomeType" [class.income-statement--matching]="activeIncomeType === 'MATCHING'" [class.income-statement--reward]="activeIncomeType === 'REWARD'" [class.income-statement--direct]="activeIncomeType === 'DIRECT'">
      <div class="income-statement__head">
        <div class="income-statement__intro">
          <h1 class="income-statement__title">{{ 'incomeStatement.title' | translate }}</h1>
          <p class="income-statement__subtitle">{{ 'incomeStatement.subtitle' | translate }}</p>
        </div>

        <div class="income-statement__tabs">
          <app-tab-bar [tabs]="tabs" [activeTabId]="activeIncomeType" (tabChange)="onTabChange($event)"></app-tab-bar>
        </div>
      </div>

      <dl class="income-statement__legend" *ngIf="activeIncomeType === 'MATCHING'">
        <div *ngFor="let key of legendKeys"><dt>{{ 'incomeStatement.' + key + 'Abbr' | translate }}</dt><dd>{{ 'incomeStatement.' + key + 'Legend' | translate }}</dd></div>
      </dl>

      <div class="income-statement__cards income-statement__cards--summary" *ngIf="activeIncomeType !== 'REWARD' && page">
        <div class="income-statement__card">
          <span class="income-statement__card-label">{{ 'incomeStatement.totalIncome' | translate }}</span>
          <span class="income-statement__card-value">{{ formatCurrency(page.totalGrossAmount) }}</span>
        </div>
        <div class="income-statement__card">
          <span class="income-statement__card-label">{{ 'incomeStatement.entriesCount' | translate }}</span>
          <span class="income-statement__card-value">{{ page.totalElements }}</span>
        </div>
      </div>

      <div class="income-statement__filters" *ngIf="activeIncomeType !== 'REWARD'">
        <div class="income-statement__filter-field">
          <label>
            {{ 'incomeStatement.cycleFilterLabel' | translate }}
            <select (change)="onCycleIdChange($any($event.target).value)">
              <option value="">{{ 'incomeStatement.cycleFilterAllOption' | translate }}</option>
              <option *ngFor="let cycle of cycles" [value]="cycle.cycleId">
                {{ formatDate(cycle.cyclePeriodStart) }} – {{ formatDate(cycle.cyclePeriodEnd) }}
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

      <div class="income-statement__table" *ngIf="activeIncomeType !== 'REWARD'">
        <app-editable-table
          [readOnly]="true"
          [columns]="statementColumns"
          [rows]="statementRows"
          [emptyStateLabel]="'incomeStatement.emptyState' | translate"
        ></app-editable-table>
      </div>

      <ng-container *ngIf="activeIncomeType === 'REWARD'">
        <div class="income-statement__cards">
          <div class="income-statement__reward-seal">
            <span class="income-statement__reward-eyebrow"><i></i>{{ 'incomeStatement.currentRank' | translate }}<i></i></span>
            <span class="income-statement__reward-rank">{{ currentRank }}</span>
          </div>
          <div class="income-statement__card" *ngFor="let c of rewardCards">
            <span class="income-statement__card-label">{{ c.labelKey | translate }}</span>
            <span class="income-statement__card-value">{{ c.value }}</span>
          </div>
        </div>

        <div class="income-statement__table">
          <app-editable-table [readOnly]="true" [columns]="rewardTierColumns" [rows]="rewardTierRows"></app-editable-table>
        </div>

        <h2 class="income-statement__reward-heading">{{ 'incomeStatement.achievedRewardsTitle' | translate }}</h2>
        <div class="income-statement__table">
          <app-editable-table
            [readOnly]="true"
            [columns]="achievedColumns"
            [rows]="achievedRows"
            [emptyStateLabel]="'incomeStatement.achievedEmptyState' | translate"
          ></app-editable-table>
        </div>
      </ng-container>

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
  private profileService = inject(AssociateProfileService);
  private profile: AssociateProfileResponse | null = null;
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
  currentRank = '—';
  rewardCards: { labelKey: string; value: string }[] = [];
  rewardTierColumns: EditableTableColumn[] = [];
  rewardTierRows: Record<string, string>[] = [];
  achievedColumns: EditableTableColumn[] = [];
  achievedRows: Record<string, string>[] = [];
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
    this.profileService.getProfile().pipe(takeUntil(this.destroyed$)).subscribe({
      next: p => {
        this.profile = p;
        this.updateTableRows();
      },
      error: () => {}
    });
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
    if (this.activeIncomeType === 'REWARD') {
      this.buildRewardColumns();
      return;
    }
    if (this.activeIncomeType === 'DIRECT') {
      this.buildDirectColumns();
      return;
    }
    if (this.activeIncomeType === 'ROYALTY') {
      this.buildRoyaltyColumns();
      return;
    }
    if (this.activeIncomeType === 'SPONSOR_MATCHING') {
      this.buildSponsorMatchingColumns();
      return;
    }
    this.translate
      .get([
        'incomeStatement.columnIncomeType',
        'incomeStatement.columnCyclePeriod',
        'incomeStatement.columnStatus',
        'incomeStatement.columnGrossAmount',
        'incomeStatement.columnCreatedAt'
      ])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.statementColumns = [
          { key: 'incomeType', label: t['incomeStatement.columnIncomeType'], type: 'text' },
          { key: 'cyclePeriod', label: t['incomeStatement.columnCyclePeriod'], type: 'text' },
          { key: 'status', label: t['incomeStatement.columnStatus'], type: 'badge', badgeTone: ledgerStatusTone },
          { key: 'grossAmount', label: t['incomeStatement.columnGrossAmount'], type: 'text' },
          { key: 'createdAt', label: t['incomeStatement.columnCreatedAt'], type: 'text' }
        ];
      });
  }

  private buildRewardColumns(): void {
    const keys = ['#', 'columnDesignation', 'columnReward', 'leftLeg', 'rightLeg', 'columnStatus'];
    const achievedKeys = ['columnAchieved', 'columnDesignation', 'columnReward', 'columnPayStatus', 'columnPaymentDate', 'columnRemarks'];
    this.translate
      .get([...keys, ...achievedKeys].filter(k => k !== '#').map(k => 'incomeStatement.' + k))
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        const label = (k: string) => (k === '#' ? '#' : t['incomeStatement.' + k]);
        const done = t['incomeStatement.statusAchieved'];
        const inProgress = t['incomeStatement.statusInProgress'];
        const tierTone = (v: string | number): BadgeTone => (v === done ? 'success' : v === inProgress ? 'warning' : 'default');
        const tierKeys = ['n', 'designation', 'reward', 'left', 'right', 'status'];
        this.rewardTierColumns = tierKeys.map((key, i) => ({
          key, label: label(keys[i]), type: 'text' as const, ...(key === 'status' ? { type: 'badge' as const, badgeTone: tierTone } : {})
        }));
        const paid = this.translate.instant('incomeStatement.payStatusPaid');
        const payTone = (v: string | number): BadgeTone => (v === paid ? 'success' : 'warning');
        const achKeys = ['date', 'designation', 'reward', 'payStatus', 'paymentDate', 'remarks'];
        this.achievedColumns = achKeys.map((key, i) => ({
          key, label: label(achievedKeys[i]), type: 'text' as const, ...(key === 'payStatus' ? { type: 'badge' as const, badgeTone: payTone } : {})
        }));
      });
  }

  private buildDirectColumns(): void {
    const keys = ['DateTime', 'AssociateId', 'AssociateName', 'Amount', 'DirectIncome'];
    const rowKeys = ['dateTime', 'associateId', 'name', 'amount', 'directIncome'];
    this.translate
      .get(keys.map(k => 'incomeStatement.column' + k))
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.statementColumns = rowKeys.map((key, i) => ({ key, label: t['incomeStatement.column' + keys[i]], type: 'text' as const }));
      });
  }

  private buildRoyaltyColumns(): void {
    const keys = ['Date', 'NewLeftBusiness', 'NewRightBusiness', 'NewMatchingBusiness', 'RoyaltyBonus'];
    const rowKeys = ['date', 'newLeft', 'newRight', 'newMatching', 'royaltyBonus'];
    this.translate
      .get(keys.map(k => 'incomeStatement.column' + k))
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.statementColumns = rowKeys.map((key, i) => ({ key, label: t['incomeStatement.column' + keys[i]], type: 'text' as const }));
      });
  }

  private buildSponsorMatchingColumns(): void {
    const keys = ['Date', 'MemberId', 'MatchingIncome', 'SponsorMatchingIncome'];
    const rowKeys = ['date', 'memberId', 'matchingIncome', 'sponsorMatchingIncome'];
    this.translate
      .get(keys.map(k => 'incomeStatement.column' + k))
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.statementColumns = rowKeys.map((key, i) => ({ key, label: t['incomeStatement.column' + keys[i]], type: 'text' as const }));
      });
  }

  private rewardText(amount: number, perk: string | null): string {
    return [this.formatCurrency(amount), perk].filter(Boolean).join(' ');
  }

  // Compact INR for bar labels: 1,500,000 -> "₹15 L", 120,000,000 -> "₹12 Cr".
  private shortInr(n: number): string {
    return n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : `₹${+(n / 1e5).toFixed(2)} L`;
  }

  private loadRewardTiers(): void {
    this.loadError = false;
    this.page = null;
    this.incomeStatementService.rewardTiers().subscribe({
      next: tiers => {
        // API only exposes remaining volume per leg (max(0, threshold - total)), so recover the
        // total from the first tier still short on that leg; if none, the leg already covers the
        // top tier -- use its threshold as a lower bound.
        const top = tiers.length ? Math.max(...tiers.map(t => t.matchingBusiness)) : 0;
        const legTotal = (req: (t: RewardTierRow) => number): number => {
          const short = tiers.find(t => req(t) > 0);
          return short ? short.matchingBusiness - req(short) : top;
        };
        const left = legTotal(t => t.requiredLeftBusiness);
        const right = legTotal(t => t.requiredRightBusiness);
        const firstOpen = tiers.findIndex(t => !t.status);
        this.rewardTierRows = tiers.map((t, i) => {
          const state = t.status ? 'achieved' : i === firstOpen ? 'progress' : 'pending';
          const legText = (leg: number) => `${this.shortInr(Math.min(leg, t.matchingBusiness))} / ${this.shortInr(t.matchingBusiness)}`;
          return {
            n: String(t.tierLevel),
            designation: `${t.designation ?? '—'} (${this.formatCurrency(t.matchingBusiness)} ${this.translate.instant('incomeStatement.matchingSuffix')})`,
            reward: this.rewardText(t.reward, t.perkDescription),
            left: legText(left),
            right: legText(right),
            status: this.translate.instant(state === 'achieved' ? 'incomeStatement.statusAchieved' : state === 'progress' ? 'incomeStatement.statusInProgress' : 'incomeStatement.statusPending')
          };
        });
        const achievedTiers = tiers.filter(t => t.status);
        this.currentRank = achievedTiers.length ? (achievedTiers[achievedTiers.length - 1].designation ?? '—') : '—';
        this.rewardCards = [
          { labelKey: 'incomeStatement.leftBusiness', value: this.formatCurrency(left) },
          { labelKey: 'incomeStatement.rightBusiness', value: this.formatCurrency(right) },
          { labelKey: 'incomeStatement.matchingBusiness', value: this.formatCurrency(Math.min(left, right)) }
        ];
      },
      error: () => (this.loadError = true)
    });
    this.incomeStatementService.rewardsAchieved().subscribe({
      next: rows => {
        this.achievedRows = rows.map(r => ({
          date: this.formatDate(r.achievedDate, DATE_FORMAT) ?? r.achievedDate,
          designation: r.designation ?? '—',
          reward: this.rewardText(r.reward, r.perkDescription),
          payStatus: this.translate.instant(r.paid ? 'incomeStatement.payStatusPaid' : 'incomeStatement.payStatusUnpaid'),
          paymentDate: r.paymentDate ? (this.formatDate(r.paymentDate, DATE_FORMAT) ?? r.paymentDate) : '—',
          remarks: r.remarks ?? '—'
        }));
      },
      error: () => (this.loadError = true)
    });
  }

  private buildMatchingColumns(): void {
    const keys = ['columnPeriod', ...MATCHING_KEYS.map(k => k + 'Abbr'), 'columnMatchingBusiness', 'columnMatchingIncome']
      .map(k => 'incomeStatement.' + k);
    this.translate
      .get(keys)
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        const cols = ['period', ...MATCHING_KEYS, 'matchingBusiness', 'matchingIncome'];
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
    if (this.activeIncomeType === 'REWARD') {
      this.loadRewardTiers();
      return;
    }
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
  // en-US pinned: the app locale abbreviates September to "Sept", breaking the 3-letter month.
  protected formatDate(value: string | null | undefined, format: string = DATE_FORMAT): string | null {
    return this.datePipe.transform(value, format, undefined, 'en-US');
  }

  protected formatCurrency(amount: number): string {
    return this.currencyPipe.transform(amount, 'INR', 'symbol', '1.0-2') ?? String(amount);
  }

  private updateMatchingRows(): void {
    const n = (v: number | undefined) => String(v ?? 0);
    this.statementRows = (this.page?.entries ?? []).map((entry, i) => {
      const b = entry.legBreakdown;
      return {
        period: `${this.formatDate(entry.cyclePeriodStart, DATE_FORMAT)} – ${this.formatDate(entry.cyclePeriodEnd, DATE_FORMAT)}`,
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
    if (this.activeIncomeType === 'ROYALTY') {
      const n = (v: number | undefined) => String(v ?? 0);
      this.statementRows = (this.page?.entries ?? []).map(entry => ({
        date: `${this.formatDate(entry.cyclePeriodStart, DATE_FORMAT)} – ${this.formatDate(entry.cyclePeriodEnd, DATE_FORMAT)}`,
        newLeft: n(entry.legBreakdown?.newLeft),
        newRight: n(entry.legBreakdown?.newRight),
        newMatching: n(entry.legBreakdown?.matchingBusiness),
        royaltyBonus: this.formatCurrency(entry.grossAmount)
      }));
      return;
    }
    if (this.activeIncomeType === 'DIRECT') {
      this.statementRows = (this.page?.entries ?? []).map(entry => ({
        dateTime: this.formatDate(entry.createdAt, DATE_TIME_FORMAT) ?? entry.createdAt,
        associateId: this.profile?.userId ?? '',
        name: this.profile?.name ?? '',
        amount: this.formatCurrency(entry.grossAmount),
        directIncome: this.formatCurrency(entry.grossAmount)
      }));
      return;
    }
    if (this.activeIncomeType === 'SPONSOR_MATCHING') {
      this.statementRows = (this.page?.entries ?? []).map(entry => ({
        date: this.formatDate(entry.createdAt, DATE_TIME_FORMAT) ?? entry.createdAt,
        memberId: entry.sponseeUserId ?? '',
        matchingIncome: entry.sponseeMatchingAmount == null ? '' : this.formatCurrency(entry.sponseeMatchingAmount),
        sponsorMatchingIncome: this.formatCurrency(entry.grossAmount)
      }));
      return;
    }
    this.statementRows = (this.page?.entries ?? []).map(entry => ({
      incomeType: entry.incomeType,
      cyclePeriod: `${this.formatDate(entry.cyclePeriodStart, DATE_FORMAT)} – ${this.formatDate(entry.cyclePeriodEnd, DATE_FORMAT)}`,
      status: entry.status,
      grossAmount: this.formatCurrency(entry.grossAmount),
      createdAt: this.formatDate(entry.createdAt, DATE_TIME_FORMAT) ?? entry.createdAt
    }));
  }
}
