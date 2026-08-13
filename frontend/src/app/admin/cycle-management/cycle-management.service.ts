import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CycleStatus, CyclePage } from '../models/cycle.model';
import { CycleDetail } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';

@Injectable({ providedIn: 'root' })
export class CycleManagementService {
  private http = inject(HttpClient);

  list(status: CycleStatus | '', page: number, size: number): Observable<CyclePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<CyclePage>('/api/admin/cycles', { params });
  }

  detail(id: string): Observable<CycleDetail> {
    return this.http.get<CycleDetail>(`/api/admin/cycles/${id}`);
  }

  close(id: string): Observable<CycleCloseResponse> {
    return this.http.post<CycleCloseResponse>(`/api/admin/cycles/${id}/close`, {});
  }
}
