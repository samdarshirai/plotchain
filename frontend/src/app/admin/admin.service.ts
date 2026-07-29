import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateAssociateRequest } from './models/create-associate-request.model';
import { CreateAssociateResponse } from './models/create-associate-response.model';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  createAssociate(request: CreateAssociateRequest): Observable<CreateAssociateResponse> {
    return this.http.post<CreateAssociateResponse>('/api/associates', request);
  }
}
