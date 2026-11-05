import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RewardTierRow } from './models/reward-tier-row.model';
import { RewardBusiness } from './models/reward-business.model';
import { RewardAchievedRow } from './models/reward-achieved-row.model';
import { AssociateLedgerFilters, AssociateLedgerPage } from './models/associate-ledger-page.model';
import { IncomeSummaryRow } from './models/income-summary-row.model';

const dateParams = (from: string, to: string): HttpParams => {
  let p = new HttpParams();
  if (from) p = p.set('from', from);
  if (to) p = p.set('to', to);
  return p;
};

@Injectable({ providedIn: 'root' })
export class IncomeStatementService {
  private http = inject(HttpClient);

  list(filters: AssociateLedgerFilters, page: number, size: number): Observable<AssociateLedgerPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AssociateLedgerPage>('/api/associates/me/ledger', { params });
  }

  summary(from = '', to = ''): Observable<IncomeSummaryRow[]> {
    return this.http.get<IncomeSummaryRow[]>('/api/associates/me/income-summary', { params: dateParams(from, to) });
  }

  downlineIncome(from = '', to = ''): Observable<IncomeSummaryRow[]> {
    return this.http.get<IncomeSummaryRow[]>('/api/associates/me/downline-income', { params: dateParams(from, to) });
  }

  rewardTiers(): Observable<RewardTierRow[]> {
    return this.http.get<RewardTierRow[]>('/api/associates/me/reward-tiers');
  }

  rewardBusiness(): Observable<RewardBusiness> {
    return this.http.get<RewardBusiness>('/api/associates/me/reward-business');
  }

  rewardsAchieved():Observable<RewardAchievedRow[]> {
    return this.http.get<RewardAchievedRow[]>('/api/associates/me/rewards-achieved');
  }
}
