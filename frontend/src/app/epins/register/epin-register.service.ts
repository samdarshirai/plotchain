import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type EPinType = 'REGISTRATION' | 'TOPUP';

export interface EPinUnusedRow { id: string; code: string; pinType: EPinType; pinValue: number; transferDate: string | null; transferBy: string; }
export interface EPinUsedRow {
  id: string; code: string; pinType: EPinType; pinValue: number; transferDate: string | null;
  usedDate: string | null; usedByUserId: string | null; usedByName: string | null;
}
export interface JoinRequest {
  sponsorUserId: string; position: string; name: string; fatherHusbandName: string; panNumber: string;
  aadhaarNumber: string; dateOfBirth: string | null; gender: string; maritalStatus: string; email: string | null;
  phone: string; state: string; district: string; address: string; postalCode: string;
  nomineeName: string; nomineeRelation: string; transactionPassword: string;
}
export interface JoinResult { userId: string; name: string; temporaryPassword: string; }
export interface EPinRowPage<T> { rows: T[]; page: number; size: number; totalElements: number; }

const BASE = '/api/associates/me/epins';

// The unlock token proves a recent transaction-password check (backend EPinUnlockStore, 10 min).
// Kept in memory only: a reload re-prompts, which is the intended behavior for a gated screen.
@Injectable({ providedIn: 'root' })
export class EPinRegisterService {
  private http = inject(HttpClient);
  private token: string | null = null;
  private expiresAt = 0;

  isUnlocked(): boolean { return !!this.token && Date.now() < this.expiresAt; }

  lock(): void { this.token = null; }

  unlock(transactionPassword: string): Observable<unknown> {
    return this.http.post<{ token: string; expiresAt: string }>(`${BASE}/unlock`, { transactionPassword }).pipe(
      tap(r => { this.token = r.token; this.expiresAt = new Date(r.expiresAt).getTime(); })
    );
  }

  private headers(): HttpHeaders { return new HttpHeaders({ 'X-Epin-Unlock': this.token ?? '' }); }

  private params(type: EPinType | '', q: string, page: number, size: number, extra: Record<string, string> = {}): HttpParams {
    let p = new HttpParams().set('page', page).set('size', size).set('q', q);
    if (type) { p = p.set('type', type); }
    for (const [k, v] of Object.entries(extra)) { p = p.set(k, v); }
    return p;
  }

  unused(type: EPinType | '', q: string, masked: boolean, page: number, size: number): Observable<EPinRowPage<EPinUnusedRow>> {
    return this.http.get<EPinRowPage<EPinUnusedRow>>(`${BASE}/unused`, {
      headers: this.headers(), params: this.params(type, q, page, size, { masked: String(masked) })
    });
  }

  used(type: EPinType | '', q: string, page: number, size: number): Observable<EPinRowPage<EPinUsedRow>> {
    return this.http.get<EPinRowPage<EPinUsedRow>>(`${BASE}/used`, { headers: this.headers(), params: this.params(type, q, page, size) });
  }

  recipient(userId: string): Observable<{ userId: string; name: string }> {
    return this.http.get<{ userId: string; name: string }>(`${BASE}/recipient/${encodeURIComponent(userId)}`, { headers: this.headers() });
  }

  transferBulk(count: number, toUserId: string, pinType: EPinType | '', transactionPassword: string): Observable<{ transferred: number; toUserId: string; toName: string }> {
    return this.http.post<{ transferred: number; toUserId: string; toName: string }>(
      `${BASE}/transfer-bulk`, { count, toUserId, pinType: pinType || null, transactionPassword }, { headers: this.headers() });
  }

  join(id: string, body: JoinRequest): Observable<JoinResult> {
    return this.http.post<JoinResult>(`${BASE}/${id}/join`, body, { headers: this.headers() });
  }
}
