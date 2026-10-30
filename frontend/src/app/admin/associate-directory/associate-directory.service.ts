import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminAssociateFilters, AdminAssociatePage } from '../models/admin-associate-page.model';
import { AssociateProfileResponse } from '../../profile-kyc/models/associate-profile.model';
import { AssociateBankDetailsResponse, UpdateAssociateBankDetailsRequest } from '../../my-account/models/associate-bank-details.model';
import { AssociateNomineeResponse } from '../../my-account/models/associate-nominee.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';

export type AdminUpdateAssociateProfileRequest = {
  name: string; phone: string | null; email: string | null; address: string | null;
  fatherHusbandName: string | null; dateOfBirth: string | null; gender: string | null; maritalStatus: string | null;
  state: string | null; district: string | null; postalCode: string | null;
};

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

  recalculate(id: string): Observable<AdminAssociateDetail> {
    return this.http.post<AdminAssociateDetail>(`/api/admin/associates/${id}/recalculate`, {});
  }

  reactivate(id: string): Observable<AdminAssociateDetail> {
    return this.http.post<AdminAssociateDetail>(`/api/admin/associates/${id}/reactivate`, {});
  }

  resetPassword(id: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/admin/associates/${id}/reset-password`, {});
  }

  resetTransactionPassword(id: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/admin/associates/${id}/reset-transaction-password`, {});
  }

  getProfile(id: string): Observable<AssociateProfileResponse> {
    return this.http.get<AssociateProfileResponse>(`/api/admin/associates/${id}/profile`);
  }

  updateProfile(id: string, request: AdminUpdateAssociateProfileRequest): Observable<AssociateProfileResponse> {
    return this.http.put<AssociateProfileResponse>(`/api/admin/associates/${id}/profile`, request);
  }

  getBankDetails(id: string): Observable<AssociateBankDetailsResponse> {
    return this.http.get<AssociateBankDetailsResponse>(`/api/admin/associates/${id}/bank-details`);
  }

  updateBankDetails(id: string, request: UpdateAssociateBankDetailsRequest): Observable<AssociateBankDetailsResponse> {
    return this.http.put<AssociateBankDetailsResponse>(`/api/admin/associates/${id}/bank-details`, request);
  }

  getNominee(id: string): Observable<AssociateNomineeResponse> {
    return this.http.get<AssociateNomineeResponse>(`/api/admin/associates/${id}/nominee`);
  }

  updateNominee(id: string, request: { nomineeName: string | null; relation: string | null }): Observable<AssociateNomineeResponse> {
    return this.http.put<AssociateNomineeResponse>(`/api/admin/associates/${id}/nominee`, request);
  }
}
