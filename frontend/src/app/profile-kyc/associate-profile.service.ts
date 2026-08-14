import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateProfileResponse, UpdateAssociateProfileRequest } from './models/associate-profile.model';

// Wraps GET/PUT /api/associates/me/profile only (role-capability unit 11) -- deliberately not
// combined with AssociateKycService even though both render on the same screen; see this plan's
// Design decision 4 for why (one service per backend resource, matching DashboardService vs.
// SalesHistoryService's existing precedent).
@Injectable({ providedIn: 'root' })
export class AssociateProfileService {
  constructor(private http: HttpClient) {}

  getProfile(): Observable<AssociateProfileResponse> {
    return this.http.get<AssociateProfileResponse>('/api/associates/me/profile');
  }

  updateProfile(request: UpdateAssociateProfileRequest): Observable<AssociateProfileResponse> {
    return this.http.put<AssociateProfileResponse>('/api/associates/me/profile', request);
  }
}
