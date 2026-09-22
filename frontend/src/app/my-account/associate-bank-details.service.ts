import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateBankDetailsResponse, UpdateAssociateBankDetailsRequest } from './models/associate-bank-details.model';

// Wraps GET/PUT /api/associates/me/bank-details only, same one-service-per-backend-resource
// shape as AssociateProfileService.
@Injectable({ providedIn: 'root' })
export class AssociateBankDetailsService {
  constructor(private http: HttpClient) {}

  getBankDetails(): Observable<AssociateBankDetailsResponse> {
    return this.http.get<AssociateBankDetailsResponse>('/api/associates/me/bank-details');
  }

  updateBankDetails(request: UpdateAssociateBankDetailsRequest): Observable<AssociateBankDetailsResponse> {
    return this.http.put<AssociateBankDetailsResponse>('/api/associates/me/bank-details', request);
  }
}
