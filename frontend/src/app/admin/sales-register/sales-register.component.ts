import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage, AdminSaleFilters } from '../models/admin-sale-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-sales-register',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="sales-register card">
      <div class="sales-register__header">
        <h1 class="card-title">{{ 'admin.salesRegister.title' | translate }}</h1>
        <a class="sales-register__record-link" [routerLink]="['/admin/sales/new']">
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

      <p *ngIf="loadError" class="sales-register__load-error">{{ 'admin.salesRegister.loadError' | translate }}</p>
      <p *ngIf="actionError" class="sales-register__action-error">{{ 'admin.salesRegister.actionError' | translate }}</p>

      <app-editable-table
        [readOnly]="true"
        [columns]="registerColumns"
        [rows]="registerRows"
        [emptyStateLabel]="'admin.salesRegister.emptyState' | translate"
      ></app-editable-table>

      <div class="sales-register__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.salesRegister.previousPageAction' | translate }}
        </button>
        <span class="sales-register__page-indicator">
          {{ 'admin.salesRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
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

  page: AdminSalePage | null = null;
  loadError = false;
  actionError = false;
  associates: AssociateSummary[] = [];
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
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
      { key: 'status', label: this.translate.instant('admin.salesRegister.columnStatus'), type: 'text' },
      { key: 'recordedAt', label: this.translate.instant('admin.salesRegister.columnRecordedAt'), type: 'text' }
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
      amount: String(sale.amount),
      legCredited: sale.legCredited,
      status: sale.status,
      recordedAt: this.datePipe.transform(sale.recordedAt, 'medium') ?? sale.recordedAt
    }));
  }
}
