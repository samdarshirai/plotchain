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
    expect(el.querySelector('a.invoice-payments__print')?.getAttribute('href')).toContain('/admin/settings/payment-details/receipt/r1');
  });

  it('labelsEveryCellForStackedCardLayout', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table.editable-table')).not.toBeNull();
    const tds = el.querySelectorAll('tbody td');
    expect(tds.length).toBe(12);
    tds.forEach(td => expect(td.getAttribute('data-label')).toContain('admin.invoicePayments.'));
  });

  it('ignoresStaleResponse', () => {
    const c = fixture.componentInstance;
    c.apply();
    const first = httpMock.expectOne(r => r.url === '/api/admin/loan-repayments');
    c.apply();
    const second = httpMock.expectOne(r => r.url === '/api/admin/loan-repayments');
    second.flush([{ ...row, receiptNo: 'NEW' }]);
    expect(first.cancelled).toBeTrue();
    expect(c.rows.map(r => r.receiptNo)).toEqual(['NEW']);
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

  it('putsTheTableInAFlushCardSoItFillsTheBox', () => {
    const table = (fixture.nativeElement as HTMLElement).querySelector('table.invoice-payments__table')!;
    expect(table.parentElement!.classList).toContain('invoice-payments__table-card');
  });

  it('printIsAMaroonPrimaryButtonNotTheGreySecondaryVariant', () => {
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.invoice-payments__print')!;
    expect(link.classList).toContain('brand-button');
    expect(link.classList).not.toContain('brand-button--secondary');
  });

  it('stepsTheAmountFontDownForVeryLongAmountsSoTheWholeNumberShows', () => {
    const c = fixture.componentInstance;
    c.filters.patchValue({ q: 'x' });
    c.apply();
    httpMock.expectOne(r => r.url === '/api/admin/loan-repayments').flush([
      { ...row, id: 'a', amount: 999999.99 },
      { ...row, id: 'b', amount: 9999999.99 },
      { ...row, id: 'c', amount: 999999999999.99 }
    ]);
    fixture.detectChanges();
    const amountCell = (i: number) => (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')[i].querySelectorAll('td')[7];
    expect(amountCell(0).className).not.toContain('editable-table__cell--fit');
    expect(amountCell(1).classList).toContain('editable-table__cell--fit-md');
    expect(amountCell(2).classList).toContain('editable-table__cell--fit-sm');
  });
});
