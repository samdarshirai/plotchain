import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED';

export interface AdminUser {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  status: AdminUserStatus;
  lastLoginAt: string | null;
  // Present only on the create response -- shown once, never retrievable again.
  temporaryPassword?: string | null;
}

export interface AdminUserRequest {
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  status: AdminUserStatus;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private http = inject(HttpClient);

  list(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>('/api/admin/users');
  }

  create(request: AdminUserRequest): Observable<AdminUser> {
    return this.http.post<AdminUser>('/api/admin/users', request);
  }

  update(id: string, request: AdminUserRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`/api/admin/users/${id}`, request);
  }

  resetPassword(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`/api/admin/users/${id}/reset-password`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/users/${id}`);
  }
}
