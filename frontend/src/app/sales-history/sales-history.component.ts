import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';
import { PagerComponent } from '../shared/components/pager/pager.component';
import { BookingTableComponent, saleRow } from '../plot-bookings/booking-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, PagerComponent, BookingTableComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './sales-history.component.scss',
  template: `
    <div class="my-sales card" [attr.aria-busy]="!page && !loadError">
      <h1 class="card-title">{{ 'salesHistory.title' | translate }}</h1>
      <p class="my-sales__subtitle">{{ 'salesHistory.subtitle' | translate }}</p>
      <p *ngIf="loadError" class="my-sales__load-error" role="alert">{{ 'salesHistory.loadError' | translate }}</p>
      <app-booking-table *ngIf="page" [rows]="rows" [label]="'salesHistory.title' | translate"></app-booking-table>
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
  get rows() { return (this.page?.sales ?? []).map(saleRow); }

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
