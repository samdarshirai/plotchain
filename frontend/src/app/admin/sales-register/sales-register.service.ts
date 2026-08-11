import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminSaleFilters, AdminSalePage } from '../models/admin-sale-page.model';
import { CreateSaleRequest } from '../models/create-sale-request.model';
import { Sale } from '../models/sale.model';

@Injectable({ providedIn: 'root' })
export class SalesRegisterService {
  private http = inject(HttpClient);

  list(filters: AdminSaleFilters, page: number, size: number): Observable<AdminSalePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminSalePage>('/api/admin/sales', { params });
  }

  record(request: CreateSaleRequest): Observable<Sale> {
    return this.http.post<Sale>('/api/admin/sales', request);
  }

  voidSale(id: string, reason: string): Observable<Sale> {
    return this.http.post<Sale>(`/api/admin/sales/${id}/void`, { reason });
  }
}
