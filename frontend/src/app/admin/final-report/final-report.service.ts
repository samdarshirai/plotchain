import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FinalReportTable } from '../models/final-report.model';

@Injectable({ providedIn: 'root' })
export class FinalReportService {
  private http = inject(HttpClient);

  /** undefined = all cycles (param omitted); [] = none (empty param). */
  getAll(cycleIds?: string[]): Observable<FinalReportTable> {
    const params = cycleIds ? new HttpParams().set('cycleIds', cycleIds.join(',')) : new HttpParams();
    return this.http.get<FinalReportTable>('/api/admin/cycles/final-report', { params });
  }
}
