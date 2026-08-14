import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateLedgerFilters, AssociateLedgerPage } from './models/associate-ledger-page.model';

@Injectable({ providedIn: 'root' })
export class IncomeStatementService {
  private http = inject(HttpClient);

  list(filters: AssociateLedgerFilters, page: number, size: number): Observable<AssociateLedgerPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AssociateLedgerPage>('/api/associates/me/ledger', { params });
  }
}
