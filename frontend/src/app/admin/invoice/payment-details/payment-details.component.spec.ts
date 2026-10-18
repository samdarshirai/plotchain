import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PaymentDetailsComponent } from './payment-details.component';

describe('PaymentDetailsComponent', () => {
  let fixture: ComponentFixture<PaymentDetailsComponent>;
  let httpMock: HttpTestingController;
  const row = { id: 'r1', loanId: 'l1', receiptNo: 'RCP-000001', paymentDate: '2026-10-02', associateId: 'a1', associateUserId: 'VP00001',
    associateName: 'Asha', associatePhone: '9999999999', amount: 250, payMode: 'UPI', bankName: 'HDFC', txnNo: 'T1' };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PaymentDetailsComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(PaymentDetailsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/api/admin/loan-repayments').flush([row]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersAllColumnsIncludingPaymentTypeAndPrintLink', () => {
    const el = fixture.nativeElement as HTMLElement;
    ['RCP-000001', 'VP00001', 'Asha', '9999999999', 'HDFC', 'T1', 'admin.invoicePayments.paymentTypeLoanRepayment'].forEach(s => expect(el.textContent).toContain(s));
    expect(el.querySelector('a.invoice-payments__print')?.getAttribute('href')).toContain('/settings/payment-details/receipt/r1');
  });

  it('refetchesWithSearchAndDateParams', () => {
    const c = fixture.componentInstance;
    c.filters.patchValue({ from: '2026-10-01', to: '2026-10-31', q: 'asha' });
    c.apply();
    const req = httpMock.expectOne(r => r.url === '/api/admin/loan-repayments');
    expect(req.request.params.get('q')).toBe('asha');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    req.flush([]);
  });

  it('blocksFromAfterToClientSide', () => {
    const c = fixture.componentInstance;
    c.filters.patchValue({ from: '2026-10-31', to: '2026-10-01' });
    c.apply();
    httpMock.expectNone(r => r.url === '/api/admin/loan-repayments');
    expect(c.filterError).toBeTrue();
  });
});
