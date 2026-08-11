import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="sales-history card">
      <h1 class="card-title">{{ 'salesHistory.title' | translate }}</h1>
      <p class="sales-history__subtitle">{{ 'salesHistory.subtitle' | translate }}</p>

      <p *ngIf="loadError" class="sales-history__load-error">{{ 'salesHistory.loadError' | translate }}</p>

      <app-editable-table
        [readOnly]="true"
        [columns]="historyColumns"
        [rows]="historyRows"
        [emptyStateLabel]="'salesHistory.emptyState' | translate"
      ></app-editable-table>

      <div class="sales-history__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'salesHistory.previousPageAction' | translate }}
        </button>
        <span class="sales-history__page-indicator">
          {{ 'salesHistory.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'salesHistory.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SalesHistoryComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  page: AssociateSalePage | null = null;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];

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
      { key: 'buyerName', label: this.translate.instant('salesHistory.columnBuyerName'), type: 'text' },
      { key: 'buyerPhone', label: this.translate.instant('salesHistory.columnBuyerPhone'), type: 'text' },
      { key: 'amount', label: this.translate.instant('salesHistory.columnAmount'), type: 'text' },
      { key: 'associateId', label: this.translate.instant('salesHistory.columnAssociateId'), type: 'text' },
      { key: 'legCredited', label: this.translate.instant('salesHistory.columnLegCredited'), type: 'text' },
      { key: 'status', label: this.translate.instant('salesHistory.columnStatus'), type: 'text' },
      { key: 'recordedAt', label: this.translate.instant('salesHistory.columnRecordedAt'), type: 'text' }
    ];
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  private loadPage(page: number): void {
    this.loadError = false;
    this.salesHistoryService.getMySales(page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.historyRows = (this.page?.sales ?? []).map(sale => ({
      buyerName: sale.buyerName,
      buyerPhone: sale.buyerPhone,
      amount: String(sale.amount),
      associateId: sale.associateId,
      legCredited: sale.legCredited,
      status: sale.status,
      recordedAt: this.datePipe.transform(sale.recordedAt, 'medium') ?? sale.recordedAt
    }));
  }
}
