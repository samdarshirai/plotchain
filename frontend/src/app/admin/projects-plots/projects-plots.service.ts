import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Plot } from '../../setup/models/project.model';
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

  createBooking(request: CreateBookingRequest): Observable<CreatedBooking> {
    return this.http.post<CreatedBooking>('/api/admin/bookings', request);
  }

  getEmiConfig(): Observable<BookingEmiConfig> {
    return this.http.get<BookingEmiConfig>('/api/company/booking-emi');
  }
}
