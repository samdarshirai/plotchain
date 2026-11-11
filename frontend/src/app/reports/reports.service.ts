import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateBookingPage } from '../plot-bookings/models/associate-booking-page.model';

export interface BusinessReportRow {
  paymentDate: string; confirmDate: string | null; associateId: string; name: string;
  project: string; plotNumber: string; business: number;
}
export interface BusinessReport { left: BusinessReportRow[]; right: BusinessReportRow[]; }
export type Leg = 'ALL' | 'L' | 'R';
export interface EmiFilters { leg: Leg; associateId: string; cycleId: string; }
export interface CycleOption { id: string; periodStart: string; periodEnd: string | null; status: string; }

// from/to are inclusive yyyy-MM-dd days; '' means unbounded.
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);

  private params(from: string, to: string): HttpParams {
    let p = new HttpParams();
    if (from) { p = p.set('from', from); }
    if (to) { p = p.set('to', to); }
    return p;
  }

  getMyBusiness(from: string, to: string): Observable<BusinessReport> {
    return this.http.get<BusinessReport>('/api/associates/me/reports/business', { params: this.params(from, to) });
  }

  // Pending EMI of my downline; empty filter values are omitted.
  getEmi(f: EmiFilters, page: number, size: number): Observable<AssociateBookingPage> {
    let p = new HttpParams().set('leg', f.leg).set('page', page).set('size', size);
    if (f.associateId) { p = p.set('associateId', f.associateId); }
    if (f.cycleId) { p = p.set('cycleId', f.cycleId); }
    return this.http.get<AssociateBookingPage>('/api/associates/me/reports/emi', { params: p });
  }

  getCycles(): Observable<CycleOption[]> {
    return this.http.get<CycleOption[]>('/api/associates/me/cycles');
  }
}
