import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage, AdminSaleFilters } from '../models/admin-sale-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

// The backend's SaleStatus enum is shouty-uppercase (RECORDED/VOIDED); the mockup renders
// per-value colored status text Title Case (Viraj_Acres_Settings.dc.html, isSales section,
// `s.status`/`s.statusColor`). Since the editable-table badge cell renders the row's raw value
// verbatim, the row-building step below title-cases it before it ever reaches the table, and
// statusBadgeTone matches on that title-cased string -- same convention as
// AssociateDirectoryComponent's titleCase/badgeTone pair.
function titleCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0) + value.slice(1).toLowerCase();
}

@Component({
  selector: 'app-sales-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, RouterLink, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="sales-register">
      <div class="sales-register__header">
        <h1 class="card-title">{{ 'admin.salesRegister.title' | translate }}</h1>
        <a class="sales-register__record-link brand-button" [routerLink]="['/admin/sales/new']">
          {{ 'admin.salesRegister.recordSaleLink' | translate }}
        </a>
      </div>

      <div class="sales-register__filters">
        <label>
          {{ 'admin.salesRegister.associateFilterLabel' | translate }}
          <select (change)="onAssociateIdChange($any($event.target).value)">
            <option value="">{{ 'admin.salesRegister.associateFilterAllOption' | translate }}</option>
            <option *ngFor="let associate of associates" [value]="associate.id">
              {{ associate.userId }} — {{ associate.name }}
            </option>
          </select>
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
          {{ 'admin.salesRegister.recordedFromLabel' | translate }}
          <input type="date" (change)="onRecordedFromChange($any($event.target).value)" />
        </label>
        <label>
          {{ 'admin.salesRegister.recordedToLabel' | translate }}
          <input type="date" (change)="onRecordedToChange($any($event.target).value)" />
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="sales-register__load-error" (dismissed)="loadError = false">{{ 'admin.salesRegister.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger" [dismissible]="true" class="sales-register__action-error" (dismissed)="actionError = false">{{ 'admin.salesRegister.actionError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="registerColumns"
          [rows]="registerRows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.salesRegister.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <ng-container *ngIf="page!.sales[i].status === 'RECORDED'; else voidedTpl">
          <input
            type="text"
            class="sales-register__void-reason-input"
            [(ngModel)]="voidReasons[page!.sales[i].id]"
            [placeholder]="'admin.salesRegister.voidReasonPlaceholder' | translate"
          />
          <button type="button" class="sales-register__void-action brand-button brand-button--danger" (click)="voidSale(page!.sales[i].id)">
            {{ 'admin.salesRegister.voidAction' | translate }}
          </button>
        </ng-container>
        <ng-template #voidedTpl>
          <span class="sales-register__voided-tag">
            {{ 'admin.salesRegister.voidedTag' | translate }}: {{ page!.sales[i].voidReason }}
          </span>
        </ng-template>
      </ng-template>

      <div class="sales-register__pagination" *ngIf="page">
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.salesRegister.previousPageAction' | translate }}
        </button>
        <span class="sales-register__page-indicator">
          {{ 'admin.salesRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.salesRegister.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SalesRegisterComponent implements OnInit {
  private salesRegisterService = inject(SalesRegisterService);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);
  private currencyPipe = inject(CurrencyPipe);

  page: AdminSalePage | null = null;
  loadError = false;
  actionError = false;
  associates: AssociateSummary[] = [];
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  voidReasons: Record<string, string> = {};
  private associateId = '';
  private status = '';
  private recordedFrom = '';
  private recordedTo = '';

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
      { key: 'buyerName', label: this.translate.instant('admin.salesRegister.columnBuyerName'), type: 'text' },
      { key: 'buyerPhone', label: this.translate.instant('admin.salesRegister.columnBuyerPhone'), type: 'text' },
      { key: 'amount', label: this.translate.instant('admin.salesRegister.columnAmount'), type: 'text' },
      { key: 'legCredited', label: this.translate.instant('admin.salesRegister.columnLegCredited'), type: 'text' },
      {
        key: 'status',
        label: this.translate.instant('admin.salesRegister.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      },
      { key: 'recordedAt', label: this.translate.instant('admin.salesRegister.columnRecordedAt'), type: 'text' },
      { key: 'actions', label: this.translate.instant('admin.salesRegister.columnActions'), type: 'action' }
    ];
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.loadPage(0);
  }

  onAssociateIdChange(value: string): void {
    this.associateId = value;
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

  goToPage(page: number): void {
    this.loadPage(page);
  }

  voidSale(id: string): void {
    this.actionError = false;
    this.salesRegisterService.voidSale(id, this.voidReasons[id] ?? '').subscribe({
      next: () => {
        delete this.voidReasons[id];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminSaleFilters = {};
    if (this.associateId) filters.associateId = this.associateId;
    if (this.status) filters.status = this.status as AdminSaleFilters['status'];
    if (this.recordedFrom) filters.recordedFrom = this.recordedFrom;
    if (this.recordedTo) filters.recordedTo = this.recordedTo;
    this.salesRegisterService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.registerRows = (this.page?.sales ?? []).map(sale => ({
      buyerName: sale.buyerName,
      buyerPhone: sale.buyerPhone,
      amount: this.currencyPipe.transform(sale.amount, 'INR', 'symbol', '1.0-2') ?? String(sale.amount),
      legCredited: sale.legCredited,
      status: titleCase(sale.status),
      recordedAt: this.datePipe.transform(sale.recordedAt, 'medium') ?? sale.recordedAt
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
