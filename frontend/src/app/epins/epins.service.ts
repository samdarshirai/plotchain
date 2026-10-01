import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EPin, EPinPage, EPinStatus } from './epin.model';

@Injectable({ providedIn: 'root' })
export class EPinsService {
  private http = inject(HttpClient);

  list(status: EPinStatus | undefined, page: number, size: number): Observable<EPinPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<EPinPage>('/api/associates/me/epins', { params });
  }

  redeem(id: string, userId: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/redeem`, { userId });
  }

  transfer(id: string, toUserId: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/transfer`, { toUserId });
  }
}
