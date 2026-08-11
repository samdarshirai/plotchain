import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateSalePage } from './models/associate-sale-page.model';

@Injectable({ providedIn: 'root' })
export class SalesHistoryService {
  private http = inject(HttpClient);

  getMySales(page: number, size: number): Observable<AssociateSalePage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AssociateSalePage>('/api/associates/me/sales', { params });
  }
}
