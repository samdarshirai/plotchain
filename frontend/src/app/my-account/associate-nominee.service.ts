import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateNomineeResponse, UpdateAssociateNomineeRequest } from './models/associate-nominee.model';

// Wraps GET/PUT /api/associates/me/nominee only, same one-service-per-backend-resource shape as
// AssociateBankDetailsService.
@Injectable({ providedIn: 'root' })
export class AssociateNomineeService {
  constructor(private http: HttpClient) {}

  getNominee(): Observable<AssociateNomineeResponse> {
    return this.http.get<AssociateNomineeResponse>('/api/associates/me/nominee');
  }

  updateNominee(request: UpdateAssociateNomineeRequest): Observable<AssociateNomineeResponse> {
    return this.http.put<AssociateNomineeResponse>('/api/associates/me/nominee', request);
  }
}
