import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminWithdrawalFilters, AdminWithdrawalPage } from '../models/admin-withdrawal-page.model';
import { AdminWithdrawalRequest } from '../models/withdrawal-request.model';
import { CreateWithdrawalRequest } from '../models/create-withdrawal-request.model';

@Injectable({ providedIn: 'root' })
export class PayoutApprovalService {
  private http = inject(HttpClient);

  list(filters: AdminWithdrawalFilters, page: number, size: number): Observable<AdminWithdrawalPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminWithdrawalPage>('/api/admin/withdrawals', { params });
  }

  submit(request: CreateWithdrawalRequest): Observable<AdminWithdrawalRequest> {
    return this.http.post<AdminWithdrawalRequest>('/api/admin/withdrawals', request);
  }

  decide(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string): Observable<AdminWithdrawalRequest> {
    return this.http.post<AdminWithdrawalRequest>(`/api/admin/withdrawals/${id}/decision`, { decision, reason });
  }

  disburse(id: string, bankReference: string): Observable<AdminWithdrawalRequest> {
    return this.http.post<AdminWithdrawalRequest>(`/api/admin/withdrawals/${id}/disburse`, { bankReference });
  }
}
