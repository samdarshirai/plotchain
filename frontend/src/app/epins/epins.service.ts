import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
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

  // The caller's own associate id: allocatedTo on a pin is only actionable when it equals this.
  meId(): Observable<string> {
    return this.http.get<{ id: string }>('/api/associates/me/profile').pipe(map(p => p.id));
  }

  redeem(id: string, userId: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/redeem`, { userId });
  }

  transfer(id: string, toUserId: string): Observable<EPin> {
    return this.http.post<EPin>(`/api/associates/me/epins/${id}/transfer`, { toUserId });
  }
}
