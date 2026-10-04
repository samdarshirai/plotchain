import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Project } from '../setup/models/project.model';
import { PlotGridItem } from '../shared/utils/plot-grid.util';
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

  // The grid path is /api/projects/..., not /api/company/projects/... (any-authenticated, unit 10).
  getGrid(projectId: string): Observable<PlotGridItem[]> {
    return this.http.get<PlotGridItem[]>(`/api/projects/${projectId}/plots/grid`);
  }

  getMyBookings(page: number, size: number): Observable<AssociateBookingPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AssociateBookingPage>('/api/associates/me/bookings', { params });
  }
}
