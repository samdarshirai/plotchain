import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SetTransactionPasswordRequest, TransactionPasswordStatusResponse } from './models/associate-transaction-password.model';

// Wraps GET/POST /api/associates/me/transaction-password only, same one-service-per-backend-resource
// shape as AssociateBankDetailsService.
@Injectable({ providedIn: 'root' })
export class AssociateTransactionPasswordService {
  constructor(private http: HttpClient) {}

  getStatus(): Observable<TransactionPasswordStatusResponse> {
    return this.http.get<TransactionPasswordStatusResponse>('/api/associates/me/transaction-password');
  }

  setPassword(request: SetTransactionPasswordRequest): Observable<void> {
    return this.http.post<void>('/api/associates/me/transaction-password', request);
  }
}
