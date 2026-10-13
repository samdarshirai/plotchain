import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminLedgerEntry } from '../models/ledger-entry.model';
import { AdminLedgerFilters, AdminLedgerPage } from '../models/admin-ledger-page.model';

@Injectable({ providedIn: 'root' })
export class LedgerRegisterService {
  private http = inject(HttpClient);

  list(filters: AdminLedgerFilters, page: number, size: number): Observable<AdminLedgerPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminLedgerPage>('/api/admin/ledger', { params });
  }

  fulfil(id: string, fulfilledAt: string, remark: string): Observable<AdminLedgerEntry> {
    return this.http.post<AdminLedgerEntry>(`/api/admin/ledger/${id}/fulfil`, { fulfilledAt, remark });
  }
}
