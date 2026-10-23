import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateBookingPage } from './models/associate-booking-page.model';

// Optional inclusive yyyy-MM-dd bounds, sent only when set.
export const range = (p: HttpParams, from?: string, to?: string): HttpParams => {
  if (from) { p = p.set('from', from); }
  if (to) { p = p.set('to', to); }
  return p;
};

// Deliberately its own thin service, not a reuse of setup/steps/projects/projects.service.ts
// (ProjectsService) -- that service also exposes create/update/delete/CSV-import methods with
// no business being reachable from this associate-only, read-only screen. Same "one service per
// screen" convention sales-history.service.ts already established.
@Injectable({ providedIn: 'root' })
export class PlotBookingsService {
  private http = inject(HttpClient);

  getMyBookings(page: number, size: number, from?: string, to?: string): Observable<AssociateBookingPage> {
    const params = range(new HttpParams().set('page', page).set('size', size), from, to);
    return this.http.get<AssociateBookingPage>('/api/associates/me/bookings', { params });
  }

  // leg: ALL = whole team, L / R = that leg of my binary tree. Scoped to my downline server-side.
  getTeamBookings(leg: 'ALL' | 'L' | 'R', page: number, size: number, from?: string, to?: string): Observable<AssociateBookingPage> {
    const params = range(new HttpParams().set('leg', leg).set('page', page).set('size', size), from, to);
    return this.http.get<AssociateBookingPage>('/api/associates/me/team-bookings', { params });
  }
}
