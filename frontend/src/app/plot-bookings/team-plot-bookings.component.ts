import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../shared/components/pager/pager.component';
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
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent],
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
          <table class="team-bookings__table" [attr.aria-label]="'plotBookings.team.title.' + scope | translate">
            <thead>
              <tr>
                <th scope="col">{{ 'plotBookings.team.column.plot' | translate }}</th>
                <th scope="col">{{ 'plotBookings.team.column.project' | translate }}</th>
                <th scope="col">{{ 'plotBookings.team.column.associate' | translate }}</th>
                <th scope="col">{{ 'plotBookings.team.column.buyer' | translate }}</th>
                <th scope="col">{{ 'plotBookings.team.column.bookedOn' | translate }}</th>
                <th scope="col" class="team-bookings__num">{{ 'plotBookings.team.column.total' | translate }}</th>
                <th scope="col" class="team-bookings__num">{{ 'plotBookings.team.column.paid' | translate }}</th>
                <th scope="col">{{ 'plotBookings.team.column.status' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page!.bookings">
                <td class="team-bookings__mono" [attr.data-label]="'plotBookings.team.column.plot' | translate">{{ b.plotNo || '—' }}</td>
                <td [attr.data-label]="'plotBookings.team.column.project' | translate">{{ b.projectName || '—' }}</td>
                <td [attr.data-label]="'plotBookings.team.column.associate' | translate">{{ b.associateName || '—' }}</td>
                <td [attr.data-label]="'plotBookings.team.column.buyer' | translate"><strong>{{ b.buyerName }}</strong></td>
                <td class="team-bookings__mono" [attr.data-label]="'plotBookings.team.column.bookedOn' | translate">{{ b.bookedAt | date: 'mediumDate' }}</td>
                <td class="team-bookings__num" [attr.data-label]="'plotBookings.team.column.total' | translate">{{ money(b.totalAmount) }}</td>
                <td class="team-bookings__num" [attr.data-label]="'plotBookings.team.column.paid' | translate">{{ money(b.paidAmount) }}</td>
                <td [attr.data-label]="'plotBookings.team.column.status' | translate">{{ 'plotBookings.bookingStatus.' + b.status | translate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
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
  money = formatInr;

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
