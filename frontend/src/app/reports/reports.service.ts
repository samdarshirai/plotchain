import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BusinessReportRow {
  paymentDate: string; confirmDate: string | null; associateId: string; name: string;
  project: string; plotNumber: string; business: number;
}
export interface BusinessReport { left: BusinessReportRow[]; right: BusinessReportRow[]; }
export interface EmiReportRow { associateId: string; name: string; paymentDate: string; amount: number; mode: string | null; }

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

  getEmi(from: string, to: string): Observable<EmiReportRow[]> {
    return this.http.get<EmiReportRow[]>('/api/associates/me/reports/emi', { params: this.params(from, to) });
  }
}
