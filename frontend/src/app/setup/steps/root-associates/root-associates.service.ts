import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateRootAssociateRequest,
  CreateRootAssociateResponse,
  RootAssociateSlots
} from '../../models/root-associates.model';

@Injectable({ providedIn: 'root' })
export class RootAssociatesService {
  constructor(private http: HttpClient) {}

  createRootAssociates(request: CreateRootAssociateRequest): Observable<CreateRootAssociateResponse> {
    return this.http.post<CreateRootAssociateResponse>('/api/company/root-associates', request);
  }

  getSlots(): Observable<RootAssociateSlots> {
    return this.http.get<RootAssociateSlots>('/api/company/root-associates');
  }
}
