import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { formatInr } from '../shared/utils/plot-grid.util';
import { AssociateBookingPage } from './models/associate-booking-page.model';
import { PlotBookingsService } from './plot-bookings.service';

const PAGE_SIZE = 20;
type Scope = 'TEAM' | 'LEFT' | 'RIGHT';
const LEG: Record<Scope, 'ALL' | 'L' | 'R'> = { TEAM: 'ALL', LEFT: 'L', RIGHT: 'R' };

// One component behind three sibling routes (data.scope), like IncomeStatementComponent: read-only
// list of plot bookings made by my team, or by my left / right leg.
@Component({
  selector: 'app-team-plot-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="team-bookings" [attr.aria-busy]="loading">
      <h1>{{ 'plotBookings.team.title.' + scope | translate }}</h1>
      <p>{{ 'plotBookings.team.subtitle.' + scope | translate }}</p>

      <app-inline-banner *ngIf="error" tone="danger">
        {{ 'plotBookings.team.loadError' | translate }}
        <button type="button" (click)="load(requestedPage)">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>
      <p role="status" *ngIf="!page && !error">{{ 'plotBookings.loading' | translate }}</p>
      <p *ngIf="page && !page.bookings.length">{{ 'plotBookings.team.empty' | translate }}</p>

      <ng-container *ngIf="page?.bookings?.length">
        <div class="team-bookings__scroll">
          <table class="team-bookings__table">
            <thead>
              <tr>
                <th>{{ 'plotBookings.team.column.plot' | translate }}</th>
                <th>{{ 'plotBookings.team.column.project' | translate }}</th>
                <th>{{ 'plotBookings.team.column.associate' | translate }}</th>
                <th>{{ 'plotBookings.team.column.buyer' | translate }}</th>
                <th>{{ 'plotBookings.team.column.bookedOn' | translate }}</th>
                <th>{{ 'plotBookings.team.column.total' | translate }}</th>
                <th>{{ 'plotBookings.team.column.paid' | translate }}</th>
                <th>{{ 'plotBookings.team.column.status' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page!.bookings">
                <td>{{ b.plotNo || '—' }}</td>
                <td>{{ b.projectName || '—' }}</td>
                <td>{{ b.associateName || '—' }}</td>
                <td>{{ b.buyerName }}</td>
                <td>{{ b.bookedAt | date: 'mediumDate' }}</td>
                <td>{{ money(b.totalAmount) }}</td>
                <td>{{ money(b.paidAmount) }}</td>
                <td>{{ 'plotBookings.bookingStatus.' + b.status | translate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="team-bookings__pager">
          <button type="button" class="brand-button brand-button--secondary" [disabled]="page!.page === 0" (click)="load(page!.page - 1)">
            {{ 'plotBookings.previousPageAction' | translate }}
          </button>
          <span>{{ 'plotBookings.pageIndicator' | translate: { page: page!.page + 1, totalPages: totalPages } }}</span>
          <button type="button" class="brand-button brand-button--secondary" [disabled]="page!.page + 1 >= totalPages" (click)="load(page!.page + 1)">
            {{ 'plotBookings.nextPageAction' | translate }}
          </button>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .team-bookings__scroll { overflow-x: auto; }
    .team-bookings__table { width: 100%; border-collapse: collapse; }
    .team-bookings__table th, .team-bookings__table td { padding: 0.5rem 0.75rem; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border-color, #e5e5e5); }
    .team-bookings__pager { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
  `]
})
export class TeamPlotBookingsComponent implements OnInit {
  private service = inject(PlotBookingsService);
  private route = inject(ActivatedRoute);

  scope: Scope = 'TEAM';
  page: AssociateBookingPage | null = null;
  loading = false;
  error = false;
  requestedPage = 0;
  money = formatInr;

  get totalPages(): number {
    if (!this.page || this.page.size === 0) { return 1; }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

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
