import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CycleSummary } from '../models/cycle.model';
import { AdminSaleFilters, AdminSalePage } from '../models/admin-sale-page.model';

@Injectable({ providedIn: 'root' })
export class SalesRegisterService {
  private http = inject(HttpClient);

  // mine = the associate's own-tree view (same screen, /api/associates/me/sales, from/to param names).
  list(filters: AdminSaleFilters, page: number, size: number, mine = false): Observable<AdminSalePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(mine && key === 'recordedFrom' ? 'from' : mine && key === 'recordedTo' ? 'to' : key, value);
      }
    }
    return this.http.get<AdminSalePage>(mine ? '/api/associates/me/sales' : '/api/admin/sales', { params });
  }

  myCycles(): Observable<CycleSummary[]> {
    return this.http.get<CycleSummary[]>('/api/associates/me/cycles');
  }
}
