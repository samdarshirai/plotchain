import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateWithdrawalFilters, AssociateWithdrawalPage } from './models/associate-withdrawal-page.model';
import { WalletBalance } from './models/wallet-balance.model';

@Injectable({ providedIn: 'root' })
export class PayoutHistoryService {
  private http = inject(HttpClient);

  getWallet(): Observable<WalletBalance> {
    return this.http.get<WalletBalance>('/api/associates/me/wallet');
  }

  list(filters: AssociateWithdrawalFilters, page: number, size: number): Observable<AssociateWithdrawalPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AssociateWithdrawalPage>('/api/associates/me/withdrawals', { params });
  }
}
