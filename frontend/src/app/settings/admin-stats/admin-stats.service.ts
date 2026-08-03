import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminStatsResponse } from './admin-stats.model';

@Injectable({ providedIn: 'root' })
export class AdminStatsService {
  constructor(private http: HttpClient) {}

  getStats(): Observable<AdminStatsResponse> {
    return this.http.get<AdminStatsResponse>('/api/admin/stats');
  }
}
