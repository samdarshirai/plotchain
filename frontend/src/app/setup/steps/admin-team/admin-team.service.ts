import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateAdminRequest,
  CreateAdminResponse,
  AdminSummary,
  UserIdAvailability,
  RolePermissions
} from '../../models/admin-team.model';

@Injectable({ providedIn: 'root' })
export class AdminTeamService {
  constructor(private http: HttpClient) {}

  createAdmin(request: CreateAdminRequest): Observable<CreateAdminResponse> {
    return this.http.post<CreateAdminResponse>('/api/company/admins', request);
  }

  listAdmins(): Observable<AdminSummary[]> {
    return this.http.get<AdminSummary[]>('/api/company/admins');
  }

  checkUserIdAvailable(userId: string): Observable<UserIdAvailability> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<UserIdAvailability>('/api/company/admins/user-id-available', { params });
  }

  getRolePermissions(): Observable<RolePermissions> {
    return this.http.get<RolePermissions>('/api/company/admins/role-permissions');
  }
}
