import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateBankDetailsResponse } from './models/associate-bank-details.model';

// Wraps GET /api/associates/me/bank-details only, same one-service-per-backend-resource
// shape as AssociateProfileService.
@Injectable({ providedIn: 'root' })
export class AssociateBankDetailsService {
  constructor(private http: HttpClient) {}

  getBankDetails(): Observable<AssociateBankDetailsResponse> {
    return this.http.get<AssociateBankDetailsResponse>('/api/associates/me/bank-details');
  }
}
