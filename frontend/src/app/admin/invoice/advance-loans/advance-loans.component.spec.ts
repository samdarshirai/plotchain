import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdvanceLoansComponent } from './advance-loans.component';

describe('AdvanceLoansComponent', () => {
  let fixture: ComponentFixture<AdvanceLoansComponent>;
  let httpMock: HttpTestingController;
  const assoc = [{ id: 'a1', userId: 'VP00001', name: 'Asha' }];
  const loanRow = { id: 'l1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Asha', loanDate: '2026-10-01', amount: 500, previousDues: 0, repaid: 0, outstanding: 500, payMode: 'CASH' as const, bankName: null, instrumentNo: null, remarks: null };

  function init(rows: unknown[] = [loanRow]) {
    TestBed.configureTestingModule({ imports: [AdvanceLoansComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(AdvanceLoansComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates').flush(assoc);
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans').flush(rows);
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  it('fillsPreviousDuesWhenAssociatePicked', () => {
    init();
    const c = fixture.componentInstance;
    c.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues' && r.params.get('associateId') === 'a1')
      .flush({ associateId: 'a1', outstanding: 700 });
    expect(c.previousDues).toBe(700);
    expect(c.form.value.associateId).toBe('a1');
  });

  it('clearsAssociateWhenTextMatchesNobody', () => {
    init();
    const c = fixture.componentInstance;
    c.pickAssociate('nobody');
    expect(c.form.value.associateId).toBe('');
    expect(c.previousDues).toBe(0);
  });

  it('doesNotPostWithoutAssociate', () => {
    init();
    fixture.componentInstance.save();
    httpMock.expectNone({ method: 'POST', url: '/api/admin/advance-loans' });
  });

  it('postsLoanThenReloads', () => {
    init();
    const c = fixture.componentInstance;
    c.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({ associateId: 'a1', outstanding: 0 });
    c.form.patchValue({ loanDate: '2026-10-02', amount: 500, payMode: 'CASH', bankName: '' });
    c.save();
    const req = httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans' });
    expect(req.request.body.amount).toBe(500);
    expect(req.request.body.bankName).toBeNull();
    req.flush(loanRow);
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans').flush([loanRow]);
    expect(c.form.value.amount).toBe(0);
  });

  it('repayPostsToLoanEndpointAndClosesModal', () => {
    init();
    const c = fixture.componentInstance;
    c.openRepay(loanRow);
    expect(c.repayOpen).toBeTrue();
    c.repayForm.patchValue({ paymentDate: '2026-10-05', amount: 100, payMode: 'UPI' });
    c.saveRepay();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans/l1/repayments' }).flush({ receiptNo: 'RCP-000001' });
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans').flush([loanRow]);
    expect(c.repayOpen).toBeFalse();
  });

  it('showsServerErrorWhenRepaymentTooLarge', () => {
    init();
    const c = fixture.componentInstance;
    c.openRepay(loanRow);
    c.repayForm.patchValue({ paymentDate: '2026-10-05', amount: 600, payMode: 'CASH' });
    c.saveRepay();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans/l1/repayments' })
      .flush({ error: 'Repayment exceeds remaining balance of 50' }, { status: 409, statusText: 'Conflict' });
    expect(c.repayError).toContain('exceeds');
    expect(c.repayOpen).toBeTrue();
  });

  it('hidesRepayActionWhenFullyRepaid', () => {
    init([{ ...loanRow, repaid: 500, outstanding: 0 }]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.invoice-loans__repay')).toBeNull();
  });

  it('showsRepayActionWhenOutstanding', () => {
    init();
    expect((fixture.nativeElement as HTMLElement).querySelector('.invoice-loans__repay')).not.toBeNull();
  });
});
