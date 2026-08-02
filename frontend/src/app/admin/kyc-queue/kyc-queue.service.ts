import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { KycPage } from '../models/kyc-page.model';
import { KycQueueEntry } from '../models/kyc-queue-entry.model';
import { KycCounts } from '../models/kyc-counts.model';

@Injectable({ providedIn: 'root' })
export class KycQueueService {
  private http = inject(HttpClient);

  list(status: string, page: number, size: number): Observable<KycPage> {
    const params = new HttpParams().set('status', status).set('page', page).set('size', size);
    return this.http.get<KycPage>('/api/admin/kyc', { params });
  }

  decide(id: string, decision: 'VERIFIED' | 'REJECTED', reason?: string): Observable<KycQueueEntry> {
    return this.http.post<KycQueueEntry>(`/api/admin/kyc/${id}/decision`, { decision, reason });
  }

  counts(): Observable<KycCounts> {
    return this.http.get<KycCounts>('/api/admin/kyc/counts');
  }
}
