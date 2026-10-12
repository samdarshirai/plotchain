import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PaymentReceiptComponent } from './payment-receipt.component';
import { PaymentRow } from './bookings-emi.model';

describe('PaymentReceiptComponent', () => {
  let fixture: ComponentFixture<PaymentReceiptComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const row: PaymentRow = {
    bookingId: 'abcdef123456', installmentNumber: 3, paymentDate: '2026-03-02T00:00:00Z', associateCode: 'VA-1', associateName: 'Jane',
    projectName: 'Alpha', plotNo: 'A-1', amount: 250, paymentMode: 'UPI', paymentRef: 'REF9', entryBy: 'staff', confirmBy: 'admin', confirmedAt: '2026-03-03T00:00:00Z'
  };
  const make = (r: PaymentRow) => {
    fixture = TestBed.createComponent(PaymentReceiptComponent);
    fixture.componentRef.setInput('row', r);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaymentReceiptComponent, TranslateModule.forRoot()] }).compileComponents();
  });

  it('renders the receipt fields: receipt number, date, associate, project, plot, mode, reference, entry by, confirm by and date', () => {
    make(row);
    const t = el().textContent!;
    for (const s of ['ABCDEF12-3', 'Mar 2, 2026', 'VA-1 · Jane', 'Alpha', 'A-1', 'REF9', 'staff', 'admin', 'Mar 3, 2026']) { expect(t).toContain(s); }
    expect(t).toContain('admin.bookingsEmi.paymentMode.UPI');
  });

  it('shows the amount in INR as the hero figure', () => {
    make(row);
    expect(el().querySelector('.payment-receipt__amount')!.textContent).toContain('₹250');
  });

  it('Print prints the sheet element only', () => {
    make(row);
    const sheet = el().querySelector('.payment-receipt__sheet')!;
    let during = false;
    spyOn(window, 'print').and.callFake(() => { during = sheet.classList.contains('table-export-print'); });
    (el().querySelector('.payment-receipt__print') as HTMLButtonElement).click();
    expect(during).toBeTrue();
    expect(sheet.classList.contains('table-export-print')).toBeFalse();
  });

  it('Close emits closed', () => {
    make(row);
    let n = 0;
    fixture.componentInstance.closed.subscribe(() => n++);
    (el().querySelector('.payment-receipt__close') as HTMLButtonElement).click();
    expect(n).toBe(1);
  });

  it('focuses the title when it appears', async () => {
    make(row);
    await Promise.resolve();
    expect(document.activeElement).toBe(el().querySelector('.payment-receipt__title'));
  });

  it('renders dashes for null entry/confirm fields', () => {
    make({ ...row, entryBy: null, confirmBy: null, confirmedAt: null, paymentRef: null });
    const dds = Array.from(el().querySelectorAll('dd')).map(d => d.textContent!.trim());
    expect(dds.filter(d => d === '—').length).toBe(4);
  });
});
