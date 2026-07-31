import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AUDIT_LOG_SECTION_BACKEND_VALUES, AuditLogPage } from './audit-log.model';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(private http: HttpClient) {}

  // section is a camelCase key from SECTION_FILTER_OPTIONS (e.g. 'companyProfile'), or
  // null/empty for "all sections". The backend's `section` param is only ever sent as the
  // mapped SCREAMING_SNAKE_CASE value, and is omitted entirely (not sent as "") for "all".
  list(section: string | null, page: number, size: number): Observable<AuditLogPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (section) {
      const backendValue = AUDIT_LOG_SECTION_BACKEND_VALUES[section];
      if (backendValue) {
        params = params.set('section', backendValue);
      }
    }
    return this.http.get<AuditLogPage>('/api/company/audit-log', { params });
  }
}
