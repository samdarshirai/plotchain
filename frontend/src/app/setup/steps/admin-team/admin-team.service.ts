import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
    return this.http.get<UserIdAvailability>(`/api/company/admins/user-id-available?userId=${userId}`);
  }

  getRolePermissions(): Observable<RolePermissions> {
    return this.http.get<RolePermissions>('/api/company/admins/role-permissions');
  }
}
