import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdvanceLoansComponent } from './advance-loans.component';

describe('AdvanceLoansComponent', () => {
  let fixture: ComponentFixture<AdvanceLoansComponent>;
  let httpMock: HttpTestingController;
  const assoc = [{ id: 'a1', userId: 'VP00001', name: 'Asha' }];
  const loanRow = { id: 'l1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Asha', loanDate: '2026-10-01', amount: 500, previousDues: 0, repaid: 0, outstanding: 500, payMode: 'CASH' as const, bankName: null, instrumentNo: null, remarks: null };

  function init(rows: unknown[] = [loanRow]) {
    TestBed.configureTestingModule({ imports: [AdvanceLoansComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])] });
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

  it('repayIsAMaroonPrimaryButtonNotTheGreySecondaryVariant', () => {
    init();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('.invoice-loans__repay')!;
    expect(btn.classList).toContain('brand-button');
    expect(btn.classList).not.toContain('brand-button--secondary');
  });

  it('hidesRepayActionWhenFullyRepaid', () => {
    init([{ ...loanRow, repaid: 500, outstanding: 0 }]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.invoice-loans__repay')).toBeNull();
  });

  it('showsRepayActionWhenOutstanding', () => {
    init();
    expect((fixture.nativeElement as HTMLElement).querySelector('.invoice-loans__repay')).not.toBeNull();
  });

  describe('detail popup', () => {
    const rep = (id: string, no: string) => ({ id, loanId: 'l1', receiptNo: no, paymentDate: '2026-10-05', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Asha', associatePhone: '999', amount: 100, payMode: 'UPI' as const, bankName: 'SBI', txnNo: 'T' + id });
    const root = () => fixture.nativeElement as HTMLElement;
    const detailBtns = () => Array.from(root().querySelectorAll('.invoice-loans__detail')) as HTMLButtonElement[];
    const modal = () => root().querySelector('.invoice-loans__detail-modal') as HTMLElement | null;
    const open = (id = 'l1') => {
      detailBtns()[0].click();
      fixture.detectChanges();
      return httpMock.expectOne(`/api/admin/advance-loans/${id}`);
    };

    it('showsDetailForEveryRowWhileRepayStaysHiddenWhenFullyRepaid', () => {
      init([loanRow, { ...loanRow, id: 'l2', repaid: 500, outstanding: 0 }]);
      expect(detailBtns().length).toBe(2);
      expect(root().querySelectorAll('.invoice-loans__repay').length).toBe(1);
    });

    it('detailAndRepayAreBothMaroonPrimaryButtons', () => {
      init();
      for (const b of [root().querySelector('.invoice-loans__repay')!, detailBtns()[0]]) {
        expect(b.classList).toContain('brand-button');
        expect(b.classList).not.toContain('brand-button--secondary');
      }
    });

    it('fetchesAndRendersLoanFieldsAndRepaymentsInOrderWithReceiptLinks', () => {
      init();
      open().flush({ loan: { ...loanRow, remarks: 'Urgent' }, associatePhone: '9876543210', repayments: [rep('r2', 'RC2'), rep('r1', 'RC1')] });
      fixture.detectChanges();
      const text = modal()!.textContent!;
      expect(text).toContain('VP00001');
      expect(text).toContain('9876543210');
      expect(text).toContain('Urgent');
      const rows = modal()!.querySelectorAll('.invoice-loans__repayments tbody tr');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('RC2');
      expect(rows[1].textContent).toContain('RC1');
      const a = rows[0].querySelector('a')!;
      expect(a.getAttribute('href')).toContain('/settings/payment-details/receipt/r2');
      expect(a.getAttribute('target')).toBe('_blank');
    });

    it('showsEmptyStateWhenNoRepayments', () => {
      init();
      open().flush({ loan: loanRow, associatePhone: null, repayments: [] });
      fixture.detectChanges();
      expect(modal()!.querySelectorAll('.invoice-loans__repayments tbody tr').length).toBe(0);
      expect(modal()!.textContent).toContain('admin.invoiceLoans.noRepayments');
    });

    it('showsBannerOnHttpError', () => {
      init();
      open().flush({ error: 'Loan not found' }, { status: 404, statusText: 'NF' });
      fixture.detectChanges();
      expect(modal()!.textContent).toContain('Loan not found');
    });

    it('escapeAndCloseButtonClose', () => {
      init();
      open().flush({ loan: loanRow, associatePhone: null, repayments: [] });
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(modal()).toBeNull();
      open().flush({ loan: loanRow, associatePhone: null, repayments: [] });
      fixture.detectChanges();
      (modal()!.querySelector('.invoice-loans__modal-cancel') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(modal()).toBeNull();
    });

    it('ignoresLateResponseOfPreviouslyOpenedLoan', () => {
      init([loanRow, { ...loanRow, id: 'l2', associateUserId: 'VP00002' }]);
      const first = open('l1');
      detailBtns()[1].click();
      fixture.detectChanges();
      const second = httpMock.expectOne('/api/admin/advance-loans/l2');
      second.flush({ loan: { ...loanRow, id: 'l2', associateUserId: 'VP00002' }, associatePhone: null, repayments: [] });
      first.flush({ loan: loanRow, associatePhone: null, repayments: [] });
      fixture.detectChanges();
      expect(fixture.componentInstance.detail!.loan.id).toBe('l2');
    });
  });

  it('save twice synchronously posts once', () => {
    init();
    const c = fixture.componentInstance;
    c.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({ associateId: 'a1', outstanding: 0 });
    c.form.patchValue({ loanDate: '2026-10-02', amount: 500 });
    c.save();
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans' }).flush(loanRow);
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans').flush([loanRow]);
    expect(c.saving).toBeFalse();
  });

  it('saveRepay twice synchronously posts once', () => {
    init();
    const c = fixture.componentInstance;
    c.openRepay(loanRow);
    c.repayForm.patchValue({ paymentDate: '2026-10-05', amount: 100 });
    c.saveRepay();
    c.saveRepay();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans/l1/repayments' })
      .flush({ error: 'x' }, { status: 409, statusText: 'Conflict' });
    expect(c.repaySaving).toBeFalse();
  });

  it('ignores late dues response for a previously picked associate', () => {
    init();
    const c = fixture.componentInstance;
    c.associates = [...assoc, { id: 'a2', userId: 'VP00002', name: 'Bela' }];
    c.pickAssociate('VP00001 — Asha');
    const first = httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues' && r.params.get('associateId') === 'a1');
    c.pickAssociate('VP00002 — Bela');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues' && r.params.get('associateId') === 'a2')
      .flush({ associateId: 'a2', outstanding: 20 });
    first.flush({ associateId: 'a1', outstanding: 999 });
    expect(c.previousDues).toBe(20);
  });

  it('dues failure does not set loadError', () => {
    init();
    const c = fixture.componentInstance;
    c.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush('x', { status: 500, statusText: 'Err' });
    expect(c.loadError).toBeFalse();
    expect(c.formError).toBeTruthy();
  });
});

describe('AdvanceLoansComponent add popup', () => {
  let fixture: ComponentFixture<AdvanceLoansComponent>;
  let httpMock: HttpTestingController;
  let el: HTMLElement;
  const assoc = [{ id: 'a1', userId: 'VP00001', name: 'Asha' }];
  const listReq = (r: { url: string }) => r.url === '/api/admin/advance-loans';
  const popup = () => el.querySelector('.invoice-loans__add-modal');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AdvanceLoansComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(AdvanceLoansComponent);
    httpMock = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    httpMock.expectOne('/api/associates').flush(assoc);
    httpMock.expectOne(listReq).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const pick = () => {
    fixture.componentInstance.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({ associateId: 'a1', outstanding: 200 });
  };
  const fillValid = () => {
    pick();
    fixture.componentInstance.form.patchValue({ loanDate: '2026-10-02', amount: 500 });
  };

  it('hidesTheFormUntilAddLoanIsClicked', () => {
    expect(popup()).toBeNull();
    expect(el.querySelector('.invoice-loans__form')).toBeNull();
    (el.querySelector('.invoice-loans__intro .invoice-loans__add') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(popup()).not.toBeNull();
    expect(popup()!.querySelector('form')).not.toBeNull();
  });

  it('cancelClosesAndDiscardsTheAssociateAndTypedValues', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    pick();
    c.form.patchValue({ remarks: 'Typed' });
    fixture.detectChanges();
    (popup()!.querySelector('.invoice-loans__modal-cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(popup()).toBeNull();
    c.openAdd();
    expect(c.picked).toBeNull();
    expect(c.previousDues).toBe(0);
    expect(c.form.value.remarks).toBe('');
    expect(c.form.value.associateId).toBe('');
  });

  it('successfulSaveClosesThePopupAndReloadsTheList', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    fillValid();
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans' }).flush({});
    httpMock.expectOne(listReq).flush([]);
    fixture.detectChanges();
    expect(c.addOpen).toBeFalse();
    expect(popup()).toBeNull();
  });

  it('failedSaveKeepsThePopupOpenAndShowsTheErrorInsideIt', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    fillValid();
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans' })
      .flush({ error: 'Associate not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(c.addOpen).toBeTrue();
    expect(popup()!.textContent).toContain('Associate not found');
  });

  it('escapeClosesThePopup', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(c.addOpen).toBeFalse();
  });

  it('escapeAndCancelAreIgnoredWhileASaveIsInFlight', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    fillValid();
    c.save();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    c.closeAdd();
    expect(c.addOpen).toBeTrue();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans' }).flush({});
    httpMock.expectOne(listReq).flush([]);
    expect(c.addOpen).toBeFalse();
  });

  it('duesFailureMessageShowsInsideThePopup', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    c.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({}, { status: 500, statusText: 'Err' });
    fixture.detectChanges();
    expect(popup()!.querySelector('app-inline-banner')).not.toBeNull();
    expect(c.loadError).toBeFalse();
  });

  it('clearsThePickAssociateBannerOnceAnAssociateIsPicked', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    c.save();
    expect(c.formError).toBeTruthy();
    c.pickAssociate('VP00001 — Asha');
    expect(c.formError).toBeNull();
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({ associateId: 'a1', outstanding: 0 });
    expect(c.formError).toBeNull();
  });

  it('clearsAStaleSaveErrorWhenADifferentAssociateIsPicked', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    fillValid();
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/advance-loans' })
      .flush({ error: 'Associate not found' }, { status: 404, statusText: 'Not Found' });
    expect(c.formError).toContain('Associate not found');
    c.pickAssociate('VP00001 — Asha');
    expect(c.formError).toBeNull();
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({ associateId: 'a1', outstanding: 0 });
  });

  it('stillShowsTheDuesErrorAfterClearingTheOldBanner', () => {
    const c = fixture.componentInstance;
    c.openAdd();
    c.save();
    c.pickAssociate('VP00001 — Asha');
    httpMock.expectOne(r => r.url === '/api/admin/advance-loans/dues').flush({}, { status: 500, statusText: 'Err' });
    expect(c.formError).toBeTruthy();
  });
});
