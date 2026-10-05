import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig, BookingPage, OverdueReportPage, PayRequest, RegisterFilters } from './bookings-emi.model';

@Injectable({ providedIn: 'root' })
export class BookingsEmiService {
  private http = inject(HttpClient);

  list(f: RegisterFilters, page: number, size: number): Observable<BookingPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (f.status) { params = params.set('status', f.status); }
    if (f.associateId) { params = params.set('associateId', f.associateId); }
    if (f.plotId) { params = params.set('plotId', f.plotId); }
    if (f.projectId) { params = params.set('projectId', f.projectId); }
    if (f.overdue) { params = params.set('overdue', true); }
    return this.http.get<BookingPage>('/api/admin/bookings', { params });
  }

  get(id: string): Observable<Booking> {
    return this.http.get<Booking>(`/api/admin/bookings/${id}`);
  }

  pay(id: string, n: number, req: PayRequest): Observable<Booking> {
    return this.http.patch<Booking>(`/api/admin/bookings/${id}/installments/${n}/pay`, req);
  }

  confirm(id: string): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/confirm`, {});
  }

  cancel(id: string, reason: string): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/cancel`, { reason });
  }

  transfer(id: string, associateId: string): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/transfer`, { associateId });
  }

  overdue(page: number, size: number): Observable<OverdueReportPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<OverdueReportPage>('/api/admin/emi-reports/overdue', { params });
  }

  config(): Observable<BookingEmiConfig> {
    return this.http.get<BookingEmiConfig>('/api/company/booking-emi');
  }
}
