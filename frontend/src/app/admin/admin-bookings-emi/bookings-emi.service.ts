import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import {
  BookingEmiConfig, BookingPage, LastEmiFilters, LastEmiRow, OverdueReportPage, PayRequest, PaymentFilters, PaymentPage, PaymentRef, RegisterFilters
} from './bookings-emi.model';

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
    if (f.bookedFrom) { params = params.set('bookedFrom', f.bookedFrom); }
    if (f.bookedTo) { params = params.set('bookedTo', f.bookedTo); }
    if (f.cancelledFrom) { params = params.set('cancelledFrom', f.cancelledFrom); }
    if (f.cancelledTo) { params = params.set('cancelledTo', f.cancelledTo); }
    if (f.q) { params = params.set('q', f.q); }
    return this.http.get<BookingPage>('/api/admin/bookings', { params });
  }

  get(id: string): Observable<Booking> {
    return this.http.get<Booking>(`/api/admin/bookings/${id}`);
  }

  pay(id: string, n: number, req: PayRequest): Observable<Booking> {
    return this.http.patch<Booking>(`/api/admin/bookings/${id}/installments/${n}/pay`, req);
  }

  confirmPayment(id: string, n: number): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/installments/${n}/confirm`, {});
  }

  // Response is ordered by bookingId, not request order: callers must key results by id.
  confirmPayments(items: PaymentRef[]): Observable<Booking[]> {
    return this.http.post<Booking[]>('/api/admin/payments/confirm', { items });
  }

  payments(status: 'ENTERED' | 'PAID', f: PaymentFilters, page: number, size: number): Observable<PaymentPage> {
    let params = new HttpParams().set('status', status).set('page', page).set('size', size);
    if (f.from) { params = params.set('from', f.from); }
    if (f.to) { params = params.set('to', f.to); }
    if (f.projectId) { params = params.set('projectId', f.projectId); }
    return this.http.get<PaymentPage>('/api/admin/payments', { params });
  }

  lastEmi(f: LastEmiFilters): Observable<LastEmiRow[]> {
    let params = new HttpParams();
    if (f.from) { params = params.set('from', f.from); }
    if (f.to) { params = params.set('to', f.to); }
    if (f.projectId) { params = params.set('projectId', f.projectId); }
    return this.http.get<LastEmiRow[]>('/api/admin/emi-reports/last-emi', { params });
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
