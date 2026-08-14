import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateRankProgress } from './models/associate-rank-progress.model';

@Injectable({ providedIn: 'root' })
export class RewardsService {
  private http = inject(HttpClient);

  getMyRankProgress(): Observable<AssociateRankProgress> {
    return this.http.get<AssociateRankProgress>('/api/associates/me/rank-progress');
  }
}
