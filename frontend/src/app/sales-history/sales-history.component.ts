import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';
import { PagerComponent } from '../shared/components/pager/pager.component';
import { formatInr } from '../shared/utils/plot-grid.util';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, PagerComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './sales-history.component.scss',
  template: `
    <div class="my-sales card" [attr.aria-busy]="!page && !loadError">
      <h1 class="card-title">{{ 'salesHistory.title' | translate }}</h1>
      <p class="my-sales__subtitle">{{ 'salesHistory.subtitle' | translate }}</p>
      <p *ngIf="loadError" class="my-sales__load-error" role="alert">{{ 'salesHistory.loadError' | translate }}</p>
      <p *ngIf="page && !page.sales.length" class="my-sales__empty" role="status">{{ 'salesHistory.emptyState' | translate }}</p>
      <div class="my-sales__scroll" *ngIf="page?.sales?.length">
        <table class="my-sales__table" [attr.aria-label]="'salesHistory.title' | translate">
          <thead><tr>
            <th scope="col">{{ 'salesHistory.columnBuyerName' | translate }}</th>
            <th scope="col">{{ 'salesHistory.columnBuyerPhone' | translate }}</th>
            <th scope="col" class="my-sales__num">{{ 'salesHistory.columnAmount' | translate }}</th>
            <th scope="col">{{ 'salesHistory.columnAssociateId' | translate }}</th>
            <th scope="col">{{ 'salesHistory.columnAssociateName' | translate }}</th>
            <th scope="col">{{ 'salesHistory.columnLegCredited' | translate }}</th>
            <th scope="col">{{ 'salesHistory.columnStatus' | translate }}</th>
            <th scope="col">{{ 'salesHistory.columnRecordedAt' | translate }}</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let s of page!.sales">
              <td [attr.data-label]="'salesHistory.columnBuyerName' | translate">{{ s.buyerName || '—' }}</td>
              <td class="my-sales__mono" [attr.data-label]="'salesHistory.columnBuyerPhone' | translate">{{ s.buyerPhone || '—' }}</td>
              <td class="my-sales__num" [attr.data-label]="'salesHistory.columnAmount' | translate">{{ money(s.amount) }}</td>
              <td class="my-sales__mono my-sales__id" [attr.data-label]="'salesHistory.columnAssociateId' | translate">{{ s.associateUserId || '—' }}</td>
              <td class="my-sales__name" [attr.data-label]="'salesHistory.columnAssociateName' | translate">{{ s.associateName || '—' }}</td>
              <td [attr.data-label]="'salesHistory.columnLegCredited' | translate">{{ s.legCredited }}</td>
              <td [attr.data-label]="'salesHistory.columnStatus' | translate">{{ s.status }}</td>
              <td class="my-sales__mono" [attr.data-label]="'salesHistory.columnRecordedAt' | translate">{{ s.recordedAt | date: 'medium' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <app-pager *ngIf="page" [page]="page.page" [size]="page.size" [total]="page.totalElements" [disabled]="loading" (pageChange)="goToPage($event)"></app-pager>
    </div>
  `
})
export class SalesHistoryComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);

  page: AssociateSalePage | null = null;
  loadError = false;
  loading = false;
  private requestedPage = 0;
  money = formatInr;

  ngOnInit(): void {
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  private loadPage(page: number): void {
    this.requestedPage = page;
    this.loading = true;
    this.loadError = false;
    this.salesHistoryService.getMySales(page, PAGE_SIZE).subscribe({
      next: res => {
        if (page !== this.requestedPage) { return; }
        this.loading = false;
        this.page = res;
      },
      error: () => {
        if (page !== this.requestedPage) { return; }
        this.loading = false;
        this.loadError = true;
      }
    });
  }
}
