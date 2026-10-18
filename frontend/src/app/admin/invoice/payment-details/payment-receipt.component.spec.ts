import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PaymentReceiptComponent } from './payment-receipt.component';

describe('PaymentReceiptComponent', () => {
  let fixture: ComponentFixture<PaymentReceiptComponent>;
  let httpMock: HttpTestingController;
  const row = { id: 'r1', loanId: 'l1', receiptNo: 'RCP-000001', paymentDate: '2026-10-02', associateId: 'a1', associateUserId: 'VP00001',
    associateName: 'Asha', associatePhone: '9999999999', amount: 250, payMode: 'UPI', bankName: 'HDFC', txnNo: 'T1' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PaymentReceiptComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'r1' } } } }]
    });
    fixture = TestBed.createComponent(PaymentReceiptComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersReceiptWithPrintButton', () => {
    httpMock.expectOne('/api/admin/loan-repayments/r1').flush(row);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    ['RCP-000001', '250.00', 'Asha'].forEach(s => expect(el.textContent).toContain(s));
    expect(el.querySelector('.invoice-receipt__print')).not.toBeNull();
  });

  it('showsNotFoundOn404', () => {
    httpMock.expectOne('/api/admin/loan-repayments/r1').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.invoice-receipt__not-found')).not.toBeNull();
    expect(el.querySelector('.invoice-receipt__print')).toBeNull();
  });
});
