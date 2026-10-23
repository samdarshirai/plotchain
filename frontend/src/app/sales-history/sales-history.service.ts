import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { range } from '../plot-bookings/plot-bookings.service';
import { AssociateSalePage } from './models/associate-sale-page.model';

@Injectable({ providedIn: 'root' })
export class SalesHistoryService {
  private http = inject(HttpClient);

  getMySales(page: number, size: number, from?: string, to?: string): Observable<AssociateSalePage> {
    const params = range(new HttpParams().set('page', page).set('size', size), from, to);
    return this.http.get<AssociateSalePage>('/api/associates/me/sales', { params });
  }
}
