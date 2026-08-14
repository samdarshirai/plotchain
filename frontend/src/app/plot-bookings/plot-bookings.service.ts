import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Project, PlotPageResponse } from '../setup/models/project.model';
import { AssociateBookingPage } from './models/associate-booking-page.model';

// Deliberately its own thin service, not a reuse of setup/steps/projects/projects.service.ts
// (ProjectsService) -- that service also exposes create/update/delete/CSV-import methods with
// no business being reachable from this associate-only, read-only screen. Same "one service per
// screen" convention sales-history.service.ts already established.
@Injectable({ providedIn: 'root' })
export class PlotBookingsService {
  private http = inject(HttpClient);

  listProjects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/company/projects');
  }

  listPlots(projectId: string, page: number, size: number): Observable<PlotPageResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PlotPageResponse>(`/api/company/projects/${projectId}/plots`, { params });
  }

  getMyBookings(page: number, size: number): Observable<AssociateBookingPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AssociateBookingPage>('/api/associates/me/bookings', { params });
  }
}
