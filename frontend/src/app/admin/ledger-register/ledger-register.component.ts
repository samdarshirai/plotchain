import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LedgerRegisterService } from './ledger-register.service';
import { AdminLedgerPage, AdminLedgerFilters } from '../models/admin-ledger-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { CycleManagementService } from '../cycle-management/cycle-management.service';
import { CycleSummary } from '../models/cycle.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;
const CYCLE_LOOKUP_SIZE = 100;

@Component({
  selector: 'app-ledger-register',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="ledger-register">
      <div class="ledger-register__intro">
        <span class="ledger-register__eyebrow">{{ 'admin.ledgerRegister.eyebrow' | translate }}</span>
        <h1 class="ledger-register__title">{{ 'admin.ledgerRegister.title' | translate }}</h1>
        <p class="ledger-register__subtitle">{{ 'admin.ledgerRegister.subtitle' | translate }}</p>
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
            {{ 'admin.ledgerRegister.incomeTypeFilterLabel' | translate }}
            <select (change)="onIncomeTypeChange($any($event.target).value)">
              <option value="">{{ 'admin.ledgerRegister.incomeTypeFilterAllOption' | translate }}</option>
              <option value="DIRECT">{{ 'admin.ledgerRegister.incomeTypeDirectOption' | translate }}</option>
              <option value="MATCHING">{{ 'admin.ledgerRegister.incomeTypeMatchingOption' | translate }}</option>
              <option value="SPONSOR_MATCHING">{{ 'admin.ledgerRegister.incomeTypeSponsorMatchingOption' | translate }}</option>
              <option value="ROYALTY">{{ 'admin.ledgerRegister.incomeTypeRoyaltyOption' | translate }}</option>
              <option value="REWARD">{{ 'admin.ledgerRegister.incomeTypeRewardOption' | translate }}</option>
              <option value="PERK">{{ 'admin.ledgerRegister.incomeTypePerkOption' | translate }}</option>
            </select>
          </label>
        </div>
        <div class="ledger-register__filter-field">
          <label>
            {{ 'admin.ledgerRegister.cycleFilterLabel' | translate }}
            <select (change)="onCycleIdChange($any($event.target).value)">
              <option value="">{{ 'admin.ledgerRegister.cycleFilterAllOption' | translate }}</option>
              <option *ngFor="let cycle of cycles" [value]="cycle.id">
                {{ datePipe.transform(cycle.periodStart, 'mediumDate') }} – {{ datePipe.transform(cycle.periodEnd, 'mediumDate') }}
              </option>
            </select>
          </label>
        </div>
        <div class="ledger-register__filter-field">
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

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="registerColumns"
          [rows]="registerRows"
          [emptyStateLabel]="'admin.ledgerRegister.emptyState' | translate"
        ></app-editable-table>
      </div>

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
  private incomeType = '';
  private cycleId = '';
  private status = '';

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
    this.registerColumns = [
      { key: 'associate', label: this.translate.instant('admin.ledgerRegister.columnAssociate'), type: 'text' },
      { key: 'cyclePeriod', label: this.translate.instant('admin.ledgerRegister.columnCyclePeriod'), type: 'text' },
      { key: 'incomeType', label: this.translate.instant('admin.ledgerRegister.columnIncomeType'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.ledgerRegister.columnStatus'), type: 'text' },
      { key: 'netAmount', label: this.translate.instant('admin.ledgerRegister.columnNetAmount'), type: 'text' },
      { key: 'sourceRef', label: this.translate.instant('admin.ledgerRegister.columnSourceRef'), type: 'text' },
      { key: 'createdAt', label: this.translate.instant('admin.ledgerRegister.columnCreatedAt'), type: 'text' }
    ];
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.cycleManagementService.list('', 0, CYCLE_LOOKUP_SIZE).subscribe(res => (this.cycles = res.cycles));
    this.loadPage(0);
  }

  onAssociateIdChange(value: string): void {
    this.associateId = value;
    this.loadPage(0);
  }

  onIncomeTypeChange(value: string): void {
    this.incomeType = value;
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

  protected loadPage(page: number): void {
    this.loadError = false;
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

  private updateTableRows(): void {
    this.registerRows = (this.page?.entries ?? []).map(entry => ({
      associate: `${entry.associateUserId} — ${entry.associateName}`,
      cyclePeriod: `${this.datePipe.transform(entry.cyclePeriodStart, 'mediumDate')} – ${this.datePipe.transform(entry.cyclePeriodEnd, 'mediumDate')}`,
      incomeType: entry.incomeType,
      status: entry.status,
      netAmount: this.currencyPipe.transform(entry.netAmount, 'INR', 'symbol', '1.0-2') ?? String(entry.netAmount),
      sourceRef: entry.sourceRef ?? this.translate.instant('admin.ledgerRegister.noSourceRef'),
      createdAt: this.datePipe.transform(entry.createdAt, 'medium') ?? entry.createdAt
    }));
  }
}
