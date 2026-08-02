import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminAssociateFilters, AdminAssociatePage } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';

@Injectable({ providedIn: 'root' })
export class AssociateDirectoryService {
  private http = inject(HttpClient);

  list(filters: AdminAssociateFilters, page: number, size: number): Observable<AdminAssociatePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminAssociatePage>('/api/admin/associates', { params });
  }

  get(id: string): Observable<AdminAssociateDetail> {
    return this.http.get<AdminAssociateDetail>(`/api/admin/associates/${id}`);
  }

  suspend(id: string): Observable<AdminAssociateDetail> {
    return this.http.post<AdminAssociateDetail>(`/api/admin/associates/${id}/suspend`, {});
  }

  reactivate(id: string): Observable<AdminAssociateDetail> {
    return this.http.post<AdminAssociateDetail>(`/api/admin/associates/${id}/reactivate`, {});
  }

  resetPassword(id: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/admin/associates/${id}/reset-password`, {});
  }
}
