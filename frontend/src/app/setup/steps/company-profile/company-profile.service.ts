import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CompanyProfileRequest, CompanyProfileResponse } from '../../models/company-profile.model';

@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  constructor(private http: HttpClient) {}

  getProfile(): Observable<CompanyProfileResponse> {
    return this.http.get<CompanyProfileResponse>('/api/company/profile');
  }

  updateProfile(request: CompanyProfileRequest): Observable<CompanyProfileResponse> {
    return this.http.put<CompanyProfileResponse>('/api/company/profile', request);
  }
}
