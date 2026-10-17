import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type MasterProjectType = 'PLOT' | 'APARTMENT';
export type MasterProjectStatus = 'ACTIVE' | 'SUSPENDED';
export type MasterProjectMapKind = 'LOCATION' | 'PROJECT';

export interface MasterProject {
  id: string;
  name: string;
  type: MasterProjectType;
  city: string;
  state: string;
  businessPercentage: number;
  ratePerSqft: number;
  status: MasterProjectStatus;
  hasLocationMap: boolean;
  hasProjectMap: boolean;
}

export type MasterProjectRequest = Omit<MasterProject, 'id' | 'hasLocationMap' | 'hasProjectMap'>;

const BASE = '/api/admin/master-projects';

@Injectable({ providedIn: 'root' })
export class MasterProjectsService {
  private http = inject(HttpClient);

  list(): Observable<MasterProject[]> {
    return this.http.get<MasterProject[]>(BASE);
  }

  create(request: MasterProjectRequest): Observable<MasterProject> {
    return this.http.post<MasterProject>(BASE, request);
  }

  update(id: string, request: MasterProjectRequest): Observable<MasterProject> {
    return this.http.put<MasterProject>(`${BASE}/${id}`, request);
  }

  uploadMap(id: string, kind: MasterProjectMapKind, file: File): Observable<void> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<void>(`${BASE}/${id}/maps/${kind}`, body);
  }

  // Fetched as a blob (not an <img src>) because the endpoint needs the auth header.
  getMap(id: string, kind: MasterProjectMapKind): Observable<Blob> {
    return this.http.get(`${BASE}/${id}/maps/${kind}`, { responseType: 'blob' });
  }
}
