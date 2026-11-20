import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage, AdminSaleFilters } from '../models/admin-sale-page.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { titleCase } from '../../shared/utils/title-case';
import { fetchAllPages } from '../../shared/utils/fetch-all-pages';
import { CycleManagementService } from '../cycle-management/cycle-management.service';
import { CycleSummary } from '../models/cycle.model';
import { TableToolsComponent } from '../../shared/components/table-tools/table-tools.component';


// The backend's SaleStatus enum is shouty-uppercase (RECORDED/VOIDED); the mockup renders
// per-value colored status text Title Case (Viraj_Acres_Settings.dc.html, isSales section,
// `s.status`/`s.statusColor`). Since the editable-table badge cell renders the row's raw value
// verbatim, the row-building step below title-cases it before it ever reaches the table, and
// statusBadgeTone matches on that title-cased string -- same convention as
// the other admin registers' titleCase/badgeTone pairing (shared/utils/title-case.ts).

@Component({
  selector: 'app-sales-register',
  standalone: true,
  imports: [TableToolsComponent, CommonModule, TranslateModule, RouterLink, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="sales-register">
      <div class="sales-register__header">
        <h1 class="card-title">{{ 'admin.salesRegister.title' | translate }}</h1>
      </div>

      <div class="sales-register__filters">
        <label>
          {{ 'admin.salesRegister.associateFilterLabel' | translate }}
          <input
            type="text"
            [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
            (input)="onSearchInput($any($event.target).value)"
          />
        </label>
        <label>
          {{ 'admin.salesRegister.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.salesRegister.statusFilterAllOption' | translate }}</option>
            <option value="RECORDED">{{ 'admin.salesRegister.statusRecordedOption' | translate }}</option>
            <option value="VOIDED">{{ 'admin.salesRegister.statusVoidedOption' | translate }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.salesRegister.cycleFilterLabel' | translate }}
          <select (change)="onCycleChange($any($event.target).value)">
            <option value="">{{ 'admin.salesRegister.allCycles' | translate }}</option>
            <option *ngFor="let c of cycles" [value]="c.id">
              {{ c.periodStart | date: 'mediumDate' }} – {{ c.periodEnd ? (c.periodEnd | date: 'mediumDate') : ('admin.cycleManagement.ongoing' | translate) }}
            </option>
          </select>
        </label>
        <label>
          {{ 'admin.salesRegister.plotNoFilterLabel' | translate }}
          <input type="text" (input)="onPlotNoInput($any($event.target).value)" />
        </label>
        <label>
          {{ 'admin.salesRegister.recordedFromLabel' | translate }}
          <input type="date" (change)="onRecordedFromChange($any($event.target).value)" />
        </label>
        <label>
          {{ 'admin.salesRegister.recordedToLabel' | translate }}
          <input type="date" (change)="onRecordedToChange($any($event.target).value)" />
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="sales-register__load-error" (dismissed)="loadError = false">{{ 'admin.salesRegister.loadError' | translate }}</app-inline-banner>

      <div class="card">
        <app-table-tools filename="sales-register"></app-table-tools>
        <app-editable-table
          [readOnly]="true"
          [columns]="registerColumns"
          [rows]="registerRows"
          [emptyStateLabel]="'admin.salesRegister.emptyState' | translate"
        ></app-editable-table>
      </div>
    </div>
  `
})
export class SalesRegisterComponent implements OnInit {
  private salesRegisterService = inject(SalesRegisterService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);
  private currencyPipe = inject(CurrencyPipe);
  private cycleService = inject(CycleManagementService);
  // Associate portal reuses this screen (route data scope:'me'): same table, own tree only.
  private mine = inject(ActivatedRoute).snapshot.data['scope'] === 'me';

  cycles: CycleSummary[] = [];
  private cycleId = '';
  private plotNo = '';

  page: AdminSalePage | null = null;
  loadError = false;
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  private search = '';
  private status = '';
  private recordedFrom = '';
  private recordedTo = '';

  ngOnInit(): void {
    this.registerColumns = [
      { key: 'projectName', label: this.translate.instant('admin.salesRegister.columnProjectName'), type: 'text' },
      { key: 'plotNo', label: this.translate.instant('admin.salesRegister.columnPlotNo'), type: 'text' },
      { key: 'sponsorId', label: this.translate.instant('admin.salesRegister.columnSponsorId'), type: 'text' },
      { key: 'sponsorName', label: this.translate.instant('admin.salesRegister.columnSponsorName'), type: 'text' },
      { key: 'buyerAssociateId', label: this.translate.instant('admin.salesRegister.columnBuyerAssociateId'), type: 'text' },
      { key: 'buyerName', label: this.translate.instant('admin.salesRegister.columnBuyerName'), type: 'text' },
      { key: 'placementId', label: this.translate.instant('admin.salesRegister.columnPlacementId'), type: 'text' },
      { key: 'buyerPhone', label: this.translate.instant('admin.salesRegister.columnBuyerPhone'), type: 'text' },
      { key: 'amount', label: this.translate.instant('admin.salesRegister.columnAmount'), type: 'text', sum: true },
      {
        key: 'status',
        label: this.translate.instant('admin.salesRegister.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      },
      { key: 'recordedAt', label: this.translate.instant('admin.salesRegister.columnRecordedAt'), type: 'text' }
    ];
    (this.mine
      ? this.salesRegisterService.myCycles()
      : this.cycleService.list('', 0, 100).pipe(map(r => r.cycles))
    ).subscribe({ next: c => (this.cycles = c), error: () => undefined });
    this.loadPage(0);
  }

  onCycleChange(value: string): void {
    this.cycleId = value;
    this.loadPage(0);
  }

  onPlotNoInput(value: string): void {
    this.plotNo = value.trim();
    this.loadPage(0);
  }

  onSearchInput(value: string): void {
    this.search = value.trim();
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  onRecordedFromChange(value: string): void {
    this.recordedFrom = value;
    this.loadPage(0);
  }

  onRecordedToChange(value: string): void {
    this.recordedTo = value;
    this.loadPage(0);
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminSaleFilters = {};
    if (this.search) filters.search = this.search;
    if (this.status) filters.status = this.status as AdminSaleFilters['status'];
    if (this.recordedFrom) filters.recordedFrom = this.recordedFrom;
    if (this.recordedTo) filters.recordedTo = this.recordedTo;
    if (this.cycleId) filters.cycleId = this.cycleId;
    if (this.plotNo) filters.plotNo = this.plotNo;
    fetchAllPages((p, size) => this.salesRegisterService.list(filters, p, size, this.mine)).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.registerRows = (this.page?.sales ?? []).map(sale => ({
      projectName: sale.projectName ?? '',
      plotNo: sale.plotNo ?? '',
      sponsorId: sale.sponsorUserId ?? '',
      sponsorName: sale.sponsorName ?? '',
      buyerAssociateId: sale.buyerAssociateUserId ?? '',
      buyerName: sale.buyerName ?? '',
      placementId: sale.buyerPlacementUserId ?? '',
      buyerPhone: sale.buyerPhone ?? '',
      amount: this.currencyPipe.transform(sale.amount, 'INR', 'symbol', '1.0-0') ?? String(sale.amount),
      status: titleCase(sale.status),
      recordedAt: this.datePipe.transform(sale.recordedAt, 'd MMM y, h:mm a') ?? sale.recordedAt
    }));
  }

  statusBadgeTone(value: string | number): BadgeTone {
    switch (value) {
      case 'Recorded':
        return 'success';
      case 'Voided':
        return 'danger';
      default:
        return 'default';
    }
  }
}
