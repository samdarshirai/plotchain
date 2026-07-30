import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CompensationPlanRequest, CompensationPlanResponse, CompensationPlanSummary } from '../../models/compensation-plan.model';

@Injectable({ providedIn: 'root' })
export class CompensationPlanService {
  constructor(private http: HttpClient) {}

  getCurrent(): Observable<CompensationPlanResponse> {
    return this.http.get<CompensationPlanResponse>('/api/company/compensation');
  }

  getHistory(): Observable<CompensationPlanSummary[]> {
    return this.http.get<CompensationPlanSummary[]>('/api/company/compensation/history');
  }

  update(request: CompensationPlanRequest): Observable<CompensationPlanResponse> {
    return this.http.put<CompensationPlanResponse>('/api/company/compensation', request);
  }
}
