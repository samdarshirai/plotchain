import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export type PayMode = 'CASH' | 'CHEQUE' | 'DD' | 'UPI' | 'BANK_TRANSFER';
export const PAY_MODES: PayMode[] = ['CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'];
export interface ExpenseRow { id: string; expenseDate: string; expenseTypeId: string; expenseTypeName: string; projectId: string | null; projectName: string | null; payTo: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; remarks: string | null; }
export interface ExpenseCreate { expenseDate: string; expenseTypeId: string; projectId: string | null; payTo: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; remarks: string | null; }
export interface AssociateOption { id: string; userId: string; name: string; }
export interface ProjectOption { id: string; name: string; }
export interface LoanRow { id: string; associateId: string; associateUserId: string; associateName: string; loanDate: string; amount: number; previousDues: number; repaid: number; outstanding: number; payMode: PayMode; bankName: string | null; instrumentNo: string | null; remarks: string | null; }
export interface LoanDetail { loan: LoanRow; associatePhone: string | null; repayments: RepaymentRow[] }
export interface LoanCreate { associateId: string; loanDate: string; amount: number; payMode: PayMode; bankName: string | null; instrumentNo: string | null; remarks: string | null; }
export interface RepaymentCreate { paymentDate: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; }
export interface RepaymentRow { id: string; loanId: string; receiptNo: string; paymentDate: string; associateId: string; associateUserId: string; associateName: string; associatePhone: string; amount: number; payMode: PayMode; bankName: string | null; txnNo: string | null; }

// Only filters that are set (non-empty) become query params.
function params(f: Record<string, string | undefined | null>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(f)) {
    if (v) { p = p.set(k, v); }
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private http = inject(HttpClient);

  expenses(f: { from?: string; to?: string; typeId?: string; projectId?: string }): Observable<ExpenseRow[]> {
    return this.http.get<ExpenseRow[]>('/api/admin/expenses', { params: params(f) });
  }

  createExpense(b: ExpenseCreate): Observable<ExpenseRow> {
    return this.http.post<ExpenseRow>('/api/admin/expenses', b);
  }

  associates(): Observable<AssociateOption[]> {
    return this.http.get<AssociateOption[]>('/api/associates');
  }

  projects(): Observable<ProjectOption[]> {
    return this.http.get<ProjectOption[]>('/api/company/projects').pipe(map(ps => ps.map(p => ({ id: p.id, name: p.name }))));
  }

  loans(f: { associateId?: string; from?: string; to?: string }): Observable<LoanRow[]> {
    return this.http.get<LoanRow[]>('/api/admin/advance-loans', { params: params(f) });
  }

  loanDetail(id: string): Observable<LoanDetail> {
    return this.http.get<LoanDetail>(`/api/admin/advance-loans/${id}`);
  }

  createLoan(b: LoanCreate): Observable<LoanRow> {
    return this.http.post<LoanRow>('/api/admin/advance-loans', b);
  }

  dues(associateId: string): Observable<{ associateId: string; outstanding: number }> {
    return this.http.get<{ associateId: string; outstanding: number }>('/api/admin/advance-loans/dues', { params: params({ associateId }) });
  }

  repay(loanId: string, b: RepaymentCreate): Observable<RepaymentRow> {
    return this.http.post<RepaymentRow>(`/api/admin/advance-loans/${loanId}/repayments`, b);
  }

  repayments(f: { from?: string; to?: string; q?: string }): Observable<RepaymentRow[]> {
    return this.http.get<RepaymentRow[]>('/api/admin/loan-repayments', { params: params(f) });
  }

  repayment(id: string): Observable<RepaymentRow> {
    return this.http.get<RepaymentRow>(`/api/admin/loan-repayments/${id}`);
  }
}
