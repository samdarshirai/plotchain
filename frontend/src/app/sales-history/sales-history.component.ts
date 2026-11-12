import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';
import { DateRangeComponent, last30Days } from '../shared/components/date-range/date-range.component';
import { fetchAllPages } from '../shared/utils/fetch-all-pages';
import { BookingTableComponent, saleRow } from '../plot-bookings/booking-table.component';


@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, BookingTableComponent, DateRangeComponent],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './sales-history.component.scss',
  template: `
    <div class="my-sales booking-page" [attr.aria-busy]="!page && !loadError">
      <h1>{{ 'salesHistory.title' | translate }}</h1>
      <p class="my-sales__subtitle">{{ 'salesHistory.subtitle' | translate }}</p>
      <app-date-range [from]="from" [to]="to" (rangeChange)="onRange($event)"></app-date-range>
      <p *ngIf="loadError" class="my-sales__load-error" role="alert">{{ 'salesHistory.loadError' | translate }}</p>
      <app-booking-table *ngIf="page" [rows]="rows" [filterAssociate]="true" [label]="'salesHistory.title' | translate"></app-booking-table>
    </div>
  `
})
export class SalesHistoryComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);

  page: AssociateSalePage | null = null;
  loadError = false;
  loading = false;
  from = last30Days().from;
  to = last30Days().to;
  private requestedPage = 0;
  get rows() { return (this.page?.sales ?? []).map(saleRow); }

  ngOnInit(): void {
    this.loadPage(0);
  }

  onRange(r: { from: string; to: string }): void { this.from = r.from; this.to = r.to; this.loadPage(0); }

  private loadPage(page: number): void {
    this.requestedPage = page;
    this.loading = true;
    this.loadError = false;
    fetchAllPages((pg, size) => this.salesHistoryService.getMySales(pg, size, this.from, this.to)).subscribe({
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
