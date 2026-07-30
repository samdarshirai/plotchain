import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CsvValidationResponse,
  Plot,
  PlotPageResponse,
  PlotRequest,
  Project,
  ProjectRequest
} from '../../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  constructor(private http: HttpClient) {}

  listProjects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/company/projects');
  }

  getProject(id: string): Observable<Project> {
    return this.http.get<Project>(`/api/company/projects/${id}`);
  }

  createProject(request: ProjectRequest): Observable<Project> {
    return this.http.post<Project>('/api/company/projects', request);
  }

  updateProject(id: string, request: ProjectRequest): Observable<Project> {
    return this.http.put<Project>(`/api/company/projects/${id}`, request);
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`/api/company/projects/${id}`);
  }

  uploadThumbnail(id: string, file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`/api/company/projects/${id}/thumbnail`, formData);
  }

  thumbnailUrl(id: string): string {
    return `/api/company/projects/${id}/thumbnail`;
  }

  listPlots(projectId: string, page: number, size: number): Observable<PlotPageResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PlotPageResponse>(`/api/company/projects/${projectId}/plots`, { params });
  }

  createPlot(projectId: string, request: PlotRequest): Observable<Plot> {
    return this.http.post<Plot>(`/api/company/projects/${projectId}/plots`, request);
  }

  updatePlot(projectId: string, plotId: string, request: PlotRequest): Observable<Plot> {
    return this.http.put<Plot>(`/api/company/projects/${projectId}/plots/${plotId}`, request);
  }

  deletePlot(projectId: string, plotId: string): Observable<void> {
    return this.http.delete<void>(`/api/company/projects/${projectId}/plots/${plotId}`);
  }

  csvTemplateUrl(): string {
    return '/api/company/projects/plots/csv-template';
  }

  validateCsv(projectId: string, file: File): Observable<CsvValidationResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CsvValidationResponse>(`/api/company/projects/${projectId}/plots/csv/validate`, formData);
  }

  commitCsv(projectId: string, file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`/api/company/projects/${projectId}/plots/csv/commit`, formData);
  }
}
