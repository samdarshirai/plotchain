import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../shared/components/pager/pager.component';
import { AssociateBookingPage } from './models/associate-booking-page.model';
import { BookingTableComponent, bookingRow } from './booking-table.component';
import { PlotBookingsService } from './plot-bookings.service';

const PAGE_SIZE = 20;
type Scope = 'TEAM' | 'LEFT' | 'RIGHT';
const LEG: Record<Scope, 'ALL' | 'L' | 'R'> = { TEAM: 'ALL', LEFT: 'L', RIGHT: 'R' };

// One component behind three sibling routes (data.scope), like IncomeStatementComponent: read-only
// list of plot bookings made by my team, or by my left / right leg.
@Component({
  selector: 'app-team-plot-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent, BookingTableComponent],
  template: `
    <div class="team-bookings booking-page" [attr.aria-busy]="loading">
      <h1>{{ 'plotBookings.team.title.' + scope | translate }}</h1>
      <p>{{ 'plotBookings.team.subtitle.' + scope | translate }}</p>

      <app-inline-banner *ngIf="error" tone="danger">
        {{ 'plotBookings.team.loadError' | translate }}
        <button type="button" (click)="load(requestedPage)">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>
      <p role="status" *ngIf="!page && !error">{{ 'plotBookings.loading' | translate }}</p>

      <ng-container *ngIf="page">
        <app-booking-table [rows]="rows" [inline]="true" [label]="'plotBookings.team.title.' + scope | translate"></app-booking-table>
        <app-pager [page]="page!.page" [size]="page!.size" [total]="page!.totalElements" [disabled]="loading" (pageChange)="load($event)"></app-pager>
      </ng-container>
    </div>
  `,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './team-plot-bookings.component.scss'
})
export class TeamPlotBookingsComponent implements OnInit {
  private service = inject(PlotBookingsService);
  private route = inject(ActivatedRoute);

  scope: Scope = 'TEAM';
  page: AssociateBookingPage | null = null;
  loading = false;
  error = false;
  requestedPage = 0;
  get rows() { return (this.page?.bookings ?? []).map(bookingRow); }

  // Sibling routes reuse this instance, so scope is read reactively and the list reloaded.
  ngOnInit(): void {
    this.route.data.subscribe(d => {
      this.scope = d['scope'] ?? 'TEAM';
      this.page = null;
      this.load(0);
    });
  }

  // The previous page stays on screen if this load fails.
  load(p: number): void {
    this.requestedPage = p;
    this.loading = true;
    this.error = false;
    const scope = this.scope;
    this.service.getTeamBookings(LEG[scope], p, PAGE_SIZE).subscribe({
      next: res => {
        if (p !== this.requestedPage || scope !== this.scope) { return; }
        this.loading = false;
        this.page = res;
      },
      error: () => {
        if (p !== this.requestedPage || scope !== this.scope) { return; }
        this.loading = false;
        this.error = true;
      }
    });
  }
}
