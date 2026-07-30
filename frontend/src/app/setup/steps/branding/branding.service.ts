import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CompanyBrandingRequest, CompanyBrandingResponse, LogoVariant } from '../../models/branding.model';

@Injectable({ providedIn: 'root' })
export class BrandingService {
  constructor(private http: HttpClient) {}

  getBranding(): Observable<CompanyBrandingResponse> {
    return this.http.get<CompanyBrandingResponse>('/api/company/branding');
  }

  updateBranding(request: CompanyBrandingRequest): Observable<CompanyBrandingResponse> {
    return this.http.put<CompanyBrandingResponse>('/api/company/branding', request);
  }

  uploadLogo(variant: LogoVariant, file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`/api/company/branding/logo/${variant}`, formData);
  }

  logoUrl(variant: LogoVariant): string {
    return `/api/company/branding/logo/${variant}`;
  }
}
