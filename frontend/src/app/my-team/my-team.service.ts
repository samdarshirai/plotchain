import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminAssociateFilters, AdminAssociatePage } from '../admin/models/admin-associate-page.model';

// Self-scoped server-side: the backend resolves the caller from the JWT and returns only their
// downline (self excluded).
@Injectable({ providedIn: 'root' })
export class MyTeamService {
  private http = inject(HttpClient);

  list(filters: AdminAssociateFilters, page: number, size: number): Observable<AdminAssociatePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<AdminAssociatePage>('/api/associates/me/downline', { params });
  }
}
