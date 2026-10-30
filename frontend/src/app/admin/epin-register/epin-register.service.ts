import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AllocateResult, EPin, EPinBatchResult, EPinEvent, EPinFilters, EPinPage, EPinType, RedemptionType
} from './epin.model';

@Injectable({ providedIn: 'root' })
export class EPinRegisterService {
  private http = inject(HttpClient);

  list(filters: EPinFilters, page: number, size: number): Observable<EPinPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<EPinPage>('/api/admin/epins', { params });
  }

  generate(count: number, expiresAt?: string, pinType?: EPinType): Observable<EPinBatchResult> {
    return this.http.post<EPinBatchResult>('/api/admin/epins',
      { count, ...(expiresAt && { expiresAt }), ...(pinType && { pinType }) });
  }

  allocate(associateId: string, count: number, batchId?: string, pinType?: EPinType): Observable<AllocateResult> {
    return this.http.post<AllocateResult>('/api/admin/epins/allocate',
      { associateId, count, ...(batchId && { batchId }), ...(pinType && { pinType }) });
  }

  block(id: string, reason: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/admin/epins/${id}/block`, { reason });
  }

  unblock(id: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/admin/epins/${id}/unblock`, {});
  }

  redeem(id: string, associateId: string, redemptionType: RedemptionType): Observable<EPin> {
    return this.http.post<EPin>(`/api/admin/epins/${id}/redeem`, { associateId, redemptionType });
  }

  events(id: string): Observable<EPinEvent[]> {
    return this.http.get<EPinEvent[]>(`/api/admin/epins/${id}/events`);
  }
}
