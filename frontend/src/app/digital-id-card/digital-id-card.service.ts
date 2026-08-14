import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateIdCard } from './models/associate-id-card.model';

@Injectable({ providedIn: 'root' })
export class DigitalIdCardService {
  private http = inject(HttpClient);

  getMyIdCard(): Observable<AssociateIdCard> {
    return this.http.get<AssociateIdCard>('/api/associates/me/id-card');
  }
}
