import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Plot, PlotPageResponse } from '../../setup/models/project.model';
import { collectPages } from '../admin-bookings-emi/bookings-emi.util';
import { PlotGridItem } from '../../shared/utils/plot-grid.util';
import { BookingEmiConfig, CreateBookingRequest, CreatedBooking } from './projects-plots.model';

// Only the endpoints ProjectsService (setup/steps/projects) lacks. Project/plot CRUD and CSV
// import reuse that service as-is.
@Injectable({ providedIn: 'root' })
export class ProjectsPlotsService {
  private http = inject(HttpClient);

  // Note the path: /api/projects/..., not /api/company/projects/... -- the grid is readable by any
  // authenticated user (unit 10, Decision 10).
  getGrid(projectId: string): Observable<PlotGridItem[]> {
    return this.http.get<PlotGridItem[]>(`/api/projects/${projectId}/plots/grid`);
  }

  getPlot(projectId: string, plotId: string): Observable<Plot> {
    return this.http.get<Plot>(`/api/company/projects/${projectId}/plots/${plotId}`);
  }

  // Rates are not on the grid; walk the paged company endpoint once and key by plot id.
  getPlotRates(projectId: string): Observable<Record<string, number>> {
    const size = 500;
    return collectPages(
      page => this.http
        .get<PlotPageResponse>(`/api/company/projects/${projectId}/plots`, { params: new HttpParams().set('page', page).set('size', size) })
        .pipe(map(r => ({ rows: r.plots, totalElements: r.totalElements }))),
      size
    ).pipe(map(plots => Object.fromEntries(plots.map(p => [p.id, p.rate]))));
  }

  createBooking(request: CreateBookingRequest): Observable<CreatedBooking> {
    return this.http.post<CreatedBooking>('/api/admin/bookings', request);
  }

  getEmiConfig(): Observable<BookingEmiConfig> {
    return this.http.get<BookingEmiConfig>('/api/company/booking-emi');
  }
}
