import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type ExpenseTypeStatus = 'ACTIVE' | 'INACTIVE';

export interface ExpenseType {
  id: string;
  name: string;
  status: ExpenseTypeStatus;
}

export type ExpenseTypeRequest = Omit<ExpenseType, 'id'>;

const BASE = '/api/admin/expense-types';

@Injectable({ providedIn: 'root' })
export class ExpenseTypesService {
  private http = inject(HttpClient);

  list(): Observable<ExpenseType[]> {
    return this.http.get<ExpenseType[]>(BASE);
  }

  create(request: ExpenseTypeRequest): Observable<ExpenseType> {
    return this.http.post<ExpenseType>(BASE, request);
  }

  update(id: string, request: ExpenseTypeRequest): Observable<ExpenseType> {
    return this.http.put<ExpenseType>(`${BASE}/${id}`, request);
  }
}
