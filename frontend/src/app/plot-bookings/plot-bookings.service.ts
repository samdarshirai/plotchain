import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateBookingPage } from './models/associate-booking-page.model';

// Deliberately its own thin service, not a reuse of setup/steps/projects/projects.service.ts
// (ProjectsService) -- that service also exposes create/update/delete/CSV-import methods with
// no business being reachable from this associate-only, read-only screen. Same "one service per
// screen" convention sales-history.service.ts already established.
@Injectable({ providedIn: 'root' })
export class PlotBookingsService {
  private http = inject(HttpClient);

  getMyBookings(page: number, size: number): Observable<AssociateBookingPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AssociateBookingPage>('/api/associates/me/bookings', { params });
  }

  // leg: ALL = whole team, L / R = that leg of my binary tree. Scoped to my downline server-side.
  getTeamBookings(leg: 'ALL' | 'L' | 'R', page: number, size: number): Observable<AssociateBookingPage> {
    const params = new HttpParams().set('leg', leg).set('page', page).set('size', size);
    return this.http.get<AssociateBookingPage>('/api/associates/me/team-bookings', { params });
  }
}
