import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BookingSealComponent } from './booking-seal.component';

describe('BookingSealComponent', () => {
  let fixture: ComponentFixture<BookingSealComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const inst = (n: number, over: Record<string, unknown> = {}) =>
    ({ installmentNumber: n, amount: 250, dueDate: '2026-03-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
  const bk = (over: Record<string, unknown> = {}) => ({
    id: 'b1', plotId: 'plot-xxxxxxxx', associateId: 'a1', status: 'ACTIVE', buyerName: 'Rohit', totalAmount: 1000, installmentCount: 4,
    bookedAt: '2026-02-01T00:00:00Z', paidAmount: 250, dueAmount: 750,
    installments: [inst(1, { status: 'PAID', paidAt: '2026-02-05T00:00:00Z' }), inst(2, { overdue: true }), inst(3), inst(4, { status: 'VOID' })], ...over
  });
  const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }, { id: 'a2', userId: 'VA-2', name: 'Raj', role: 'ASSOCIATE', hasFreeSlot: true }];
  const auto = { emiEnabled: true, defaultInstallmentCount: 4, confirmRule: 'AUTO_THRESHOLD', confirmThresholdPercent: 50 };

  function setup(booking: unknown = bk(), config: unknown = auto) {
    TestBed.configureTestingModule({ imports: [BookingSealComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(BookingSealComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('booking', booking);
    fixture.componentRef.setInput('config', config);
    fixture.componentRef.setInput('directory', dir);
    fixture.componentRef.setInput('filterMismatch', false);
    fixture.detectChanges();
  }
  afterEach(() => http.verify());
  const c = () => fixture.componentInstance;
  const type = (name: string, v: string) => { const i = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!; i.value = v; i.dispatchEvent(new Event('input')); };
  const submit = () => el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

  it('shows the empty prompt without a booking', () => {
    setup(null);
    expect(el().textContent).toContain('admin.bookingsEmi.seal.none');
  });

  it('renders instalments: Pay only on PENDING rows of an ACTIVE booking, overdue pill, void struck', () => {
    setup();
    expect(el().querySelectorAll('.booking-seal__pay').length).toBe(2);
    expect(el().querySelectorAll('.booking-seal__overdue').length).toBe(1);
    expect(el().querySelectorAll('.booking-seal__row--void').length).toBe(1);
  });

  it('non-ACTIVE booking: no Pay buttons, three actions disabled with a visible reason', () => {
    setup(bk({ status: 'CONFIRMED' }));
    expect(el().querySelectorAll('.booking-seal__pay').length).toBe(0);
    const btns = el().querySelectorAll<HTMLButtonElement>('.booking-seal__action');
    expect(btns.length).toBe(3);
    btns.forEach(b => { expect(b.disabled).toBeTrue(); expect(b.getAttribute('aria-describedby')).toBe('seal-locked-reason'); });
    expect(el().querySelector('#seal-locked-reason')!.textContent).toContain('admin.bookingsEmi.locked.active');
  });

  it('cancelled booking shows the cancelled reason and "—" for due', () => {
    setup(bk({ status: 'CANCELLED', dueAmount: 0 }));
    expect(el().querySelector('#seal-locked-reason')!.textContent).toContain('admin.bookingsEmi.locked.cancelled');
    const due = Array.from(el().querySelectorAll('dd')).map(d => d.textContent!.trim());
    expect(due).toContain('—');
    expect(el().querySelector('.booking-seal__meta')!.textContent).not.toContain('₹0');
  });

  it('shows a dash, not ₹0, for the plan when there are no instalments', () => {
    setup(bk({ installments: [] }));
    expect(Array.from(el().querySelectorAll('dd')).map(d => d.textContent!.trim())).toContain('—');
  });

  it('pay form locks the amount, requires a reference, and sends no request when blank', () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    expect(el().querySelector<HTMLInputElement>('[name="amount"]')!.readOnly).toBeTrue();
    type('paymentRef', '   ');
    submit();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.ref');
    http.expectNone(r => r.url.includes('/pay'));
  });

  it('pay sends amount from the instalment, trimmed ref, and ISO paidAt when given', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', ' UPI-1 ');
    type('receivedOn', '2026-03-02T10:30');
    await fixture.whenStable();
    submit();
    const req = http.expectOne('/api/admin/bookings/b1/installments/2/pay');
    expect(req.request.body.amount).toBe(250);
    expect(req.request.body.paymentRef).toBe('UPI-1');
    expect(req.request.body.paidAt).toMatch(/^2026-03-02T/);
    req.flush(bk());
  });

  it('warns before paying when the payment will auto-confirm', () => {
    setup(bk({ paidAmount: 250 }), { ...auto, confirmThresholdPercent: 50 });
    c().open('pay', c().booking!.installments[1]); // 250+250 = 50%
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.warn.autoConfirm');
  });

  it('does not warn under MANUAL', () => {
    setup(bk(), { ...auto, confirmRule: 'MANUAL' });
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    expect(el().textContent).not.toContain('admin.bookingsEmi.warn.autoConfirm');
  });

  it('success emits the updated booking and an auto-confirm flash when status flips to CONFIRMED', async () => {
    setup();
    const flashes: unknown[] = []; const updates: unknown[] = [];
    c().flash.subscribe(f => flashes.push(f)); c().updated.subscribe(u => updates.push(u));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush(bk({ status: 'CONFIRMED', paidAmount: 500 }));
    expect(updates.length).toBe(1);
    expect((flashes[0] as { key: string }).key).toBe('admin.bookingsEmi.ok.autoConfirm');
    expect(c().mode).toBe('detail');
  });

  it('success without a status flip emits the plain payment flash', async () => {
    setup();
    const flashes: { key: string }[] = [];
    c().flash.subscribe(f => flashes.push(f));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush(bk({ paidAmount: 500 }));
    expect(flashes[0].key).toBe('admin.bookingsEmi.ok.pay');
  });

  it('409 plot drift on pay shows the not-recorded copy, keeps the form, re-enables submit', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush({ error: 'Plot is not available for booking: x' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftPay');
    expect(el().textContent).toContain('admin.bookingsEmi.err.serverSaid');
    expect(c().mode).toBe('pay');
    expect(c().busy).toBeFalse();
  });

  it('network error on pay hides submit and offers reload instead of a blind retry', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.payNetwork');
    expect(el().querySelector('button[type="submit"]')).toBeNull();
    let reloads = 0; c().reloadRequested.subscribe(() => reloads++);
    el().querySelector<HTMLButtonElement>('.booking-seal__reload')!.click();
    expect(reloads).toBe(1);
  });

  it('409 not ACTIVE asks the register to reload so the seal shows the real status', async () => {
    setup();
    let reloads = 0; c().reloadRequested.subscribe(() => reloads++);
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush({ error: 'Booking is not ACTIVE' }, { status: 409, statusText: 'Conflict' });
    expect(reloads).toBe(1);
  });

  it('a second submit while in flight sends nothing and busy is announced', async () => {
    setup();
    const busy: boolean[] = []; c().busyChange.subscribe(b => busy.push(b));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable();
    c().submitPay(); c().submitPay();
    expect(http.match(r => r.url.includes('/pay')).length).toBe(1);
    expect(busy).toEqual([true]);
  });

  it('confirm posts and emits ok.confirm', () => {
    setup();
    const flashes: { key: string }[] = []; c().flash.subscribe(f => flashes.push(f));
    c().open('confirm'); fixture.detectChanges();
    c().submitConfirm();
    http.expectOne('/api/admin/bookings/b1/confirm').flush(bk({ status: 'CONFIRMED' }));
    expect(flashes[0].key).toBe('admin.bookingsEmi.ok.confirm');
  });

  it('confirm 409 plot drift uses the confirm copy', () => {
    setup();
    c().open('confirm'); fixture.detectChanges();
    c().submitConfirm();
    http.expectOne('/api/admin/bookings/b1/confirm').flush({ error: 'Plot is not available for booking: x' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftConfirm');
  });

  it('cancel requires a reason (≤255) and states the pending count before the button', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.cancelEffects');
    c().reason = '';
    c().submitCancel();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.reason');
    c().reason = 'x'.repeat(256);
    c().submitCancel();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.reasonMax');
    http.expectNone(r => r.url.includes('/cancel'));
  });

  it('cancel posts the trimmed reason', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    c().reason = '  buyer withdrew ';
    c().submitCancel();
    const req = http.expectOne('/api/admin/bookings/b1/cancel');
    expect(req.request.body).toEqual({ reason: 'buyer withdrew' });
    req.flush(bk({ status: 'CANCELLED', dueAmount: 0 }));
  });

  it('transfer needs a target; same-associate 400 shows under the lookup', () => {
    setup();
    c().open('transfer'); fixture.detectChanges();
    c().submitTransfer();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.target');
    c().targetId = 'a1'; // the booking's own associate
    c().submitTransfer();
    fixture.detectChanges();
    http.expectNone(r => r.url.includes('/transfer'));
    expect(el().textContent).toContain('admin.bookingsEmi.err.sameAssociate');
    expect(c().transferChoices.map(a => a.id)).toEqual(['a2']);
  });

  it('switching to a different booking closes any open form', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    fixture.componentRef.setInput('booking', bk({ id: 'b2' }));
    fixture.detectChanges();
    expect(c().mode).toBe('detail');
  });

  it('shows the filter-mismatch note', () => {
    setup();
    fixture.componentRef.setInput('filterMismatch', true);
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.seal.filterMismatch');
  });

  it('network error leaves no way to resubmit: submitPay is inert and the submit control is gone until the booking input refreshes', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(c().netUnknown).toBeTrue();
    c().submitPay();
    submit();
    http.expectNone(r => r.url.includes('/pay'));
    fixture.componentRef.setInput('booking', bk({ paidAmount: 500 }));
    fixture.detectChanges();
    expect(c().netUnknown).toBeFalse();
  });

  it('the warning appears before submit with before/after amounts and states the rollback', () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.warn.autoConfirmDetail');
  });

  it('409 plot drift on pay states the payment is NOT recorded and links to the fix pages', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush({ error: 'Plot is not available for booking: x' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftFix');
    expect(el().querySelector('a[href="/settings/projects-plots"]')).not.toBeNull();
    expect(el().querySelector('a[href="/settings/payments-kyc"]')).not.toBeNull();
    expect(el().querySelector('a[href="/settings/compensation"]')).toBeNull();
  });

  it('submit is disabled while a write is in flight and busy returns to false afterwards', async () => {
    setup();
    const busy: boolean[] = []; c().busyChange.subscribe(b => busy.push(b));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    expect(el().querySelectorAll<HTMLButtonElement>('.booking-seal__pay').length).toBe(0); // form replaces the table
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush(bk());
    expect(busy).toEqual([true, false]);
  });

  it('double submit is impossible on confirm, cancel and transfer', () => {
    setup();
    c().open('confirm'); c().submitConfirm(); c().submitConfirm();
    expect(http.match(r => r.url.endsWith('/confirm')).length).toBe(1);
    TestBed.resetTestingModule();
    setup();
    c().open('cancel'); c().reason = 'r'; c().submitCancel(); c().submitCancel();
    expect(http.match(r => r.url.endsWith('/cancel')).length).toBe(1);
    TestBed.resetTestingModule();
    setup();
    c().open('transfer'); c().targetId = 'a2'; c().submitTransfer(); c().submitTransfer();
    expect(http.match(r => r.url.endsWith('/transfer')).length).toBe(1);
  });

  it('action buttons are disabled while busy', () => {
    setup();
    c().open('confirm'); c().submitConfirm();
    c().busy = true; c().mode = 'detail'; // simulate the detail view while a write is pending
    fixture.detectChanges();
    const btns = el().querySelectorAll<HTMLButtonElement>('.booking-seal__action, .booking-seal__pay');
    expect(btns.length).toBe(5);
    btns.forEach(b => expect(b.disabled).toBeTrue());
    c().busy = false;
    http.expectOne('/api/admin/bookings/b1/confirm');
  });

  it('returns focus to the opener on close, and to the title when it is gone', async () => {
    setup();
    document.body.appendChild(el());
    el().querySelector<HTMLButtonElement>('[data-opener="pay-2"]')!.click();
    fixture.detectChanges();
    c().close(); // no detectChanges: a real browser only gives one macrotask before the timer fires
    await new Promise(r => setTimeout(r));
    expect(document.activeElement).toBe(el().querySelector('[data-opener="pay-2"]'));
    c().open('cancel'); fixture.detectChanges();
    c().close();
    await new Promise(r => setTimeout(r));
    expect(document.activeElement).toBe(el().querySelector('[data-opener="cancel"]'));
    c().open('pay', c().booking!.installments[1]); fixture.detectChanges();
    fixture.componentRef.setInput('booking', bk({ installments: [inst(1, { status: 'PAID' }), inst(2, { status: 'PAID' }), inst(3), inst(4)] }));
    fixture.detectChanges();
    await new Promise(r => setTimeout(r));
    expect(document.activeElement).toBe(el().querySelector('h2'));
    el().remove();
  });

  it('pay 409 not ACTIVE: when the reload closes the form the explanation is surfaced as a flash', async () => {
    setup();
    const flashes: { key: string }[] = []; c().flash.subscribe(f => flashes.push(f));
    c().open('pay', c().booking!.installments[1]); fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush({ error: 'Booking is not ACTIVE' }, { status: 409, statusText: 'Conflict' });
    fixture.componentRef.setInput('booking', bk({ status: 'CANCELLED', dueAmount: 0 }));
    fixture.detectChanges();
    expect(c().mode).toBe('detail');
    expect(flashes.map(f => f.key)).toContain('admin.bookingsEmi.err.notActive');
  });

  it('closes any open form (cancel) when the refreshed booking is no longer ACTIVE', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    fixture.componentRef.setInput('booking', bk({ status: 'CONFIRMED' }));
    fixture.detectChanges();
    expect(c().mode).toBe('detail');
  });

  it('switching booking while a write is in flight resets the form but keeps the busy lock', () => {
    setup();
    c().open('confirm'); c().submitConfirm();
    fixture.componentRef.setInput('booking', bk({ id: 'b2' }));
    fixture.detectChanges();
    expect(c().mode).toBe('detail');
    expect(c().busy).toBeTrue();
    http.expectOne('/api/admin/bookings/b1/confirm');
  });

  it('links field errors with aria-invalid and aria-describedby', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]); fixture.detectChanges();
    type('paymentRef', ' '); await fixture.whenStable(); submit(); fixture.detectChanges();
    const input = el().querySelector('[name="paymentRef"]')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    ids.forEach(id => expect(el().querySelector('#' + id)).not.toBeNull());
    expect(el().querySelector('#seal-ref-error')!.textContent).toContain('admin.bookingsEmi.validation.ref');
  });

  it('auto-confirm warning and meter tick do not depend on emiEnabled', () => {
    setup(bk({ paidAmount: 250 }), { ...auto, emiEnabled: false });
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.warn.autoConfirm');
    c().close();
    fixture.detectChanges();
    expect(el().querySelector('.booking-seal__meter-tick')).not.toBeNull();
  });

  it('shows paise: non-integer instalment amounts render and are sent exactly', async () => {
    const third = bk({ totalAmount: 1000000, paidAmount: 0, dueAmount: 1000000, installmentCount: 3,
      installments: [inst(1, { amount: 333333.33 }), inst(2, { amount: 333333.33 }), inst(3, { amount: 333333.34 })] });
    setup(third, { ...auto, confirmRule: 'MANUAL' });
    expect(el().textContent).toContain('₹3,33,333.33');
    expect(el().textContent).toContain('₹3,33,333.34');
    c().open('pay', c().booking!.installments[2]);
    fixture.detectChanges();
    expect(el().querySelector<HTMLInputElement>('[name="amount"]')!.value).toBe('₹3,33,333.34');
    expect(el().querySelector('.booking-seal__submit')!.textContent).toContain('admin.bookingsEmi.action.payBtn');
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    const req = http.expectOne('/api/admin/bookings/b1/installments/3/pay');
    expect(req.request.body.amount).toBe(333333.34);
    req.flush(third);
  });

  it('paying the last instalment out of order uses that instalment number and amount', async () => {
    const b = bk({ installments: [inst(1, { status: 'PAID' }), inst(2, { amount: 250 }), inst(3, { amount: 275 }), inst(4, { amount: 225 })] });
    setup(b, { ...auto, confirmRule: 'MANUAL' });
    const pays = el().querySelectorAll<HTMLButtonElement>('.booking-seal__pay');
    pays[pays.length - 1].click();
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    const req = http.expectOne('/api/admin/bookings/b1/installments/4/pay');
    expect(req.request.body.amount).toBe(225);
    req.flush(b);
  });

  it('confirm plot drift offers only the Projects & Plots fix, not the Manual-rule one', () => {
    setup();
    c().open('confirm'); fixture.detectChanges();
    c().submitConfirm();
    http.expectOne('/api/admin/bookings/b1/confirm').flush({ error: 'Plot is not available for booking: x' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftFixConfirm');
    expect(el().textContent).not.toContain('admin.bookingsEmi.err.plotDriftFix' + ' ');
    expect(el().querySelector('a[href="/settings/projects-plots"]')).not.toBeNull();
    expect(el().querySelector('a[href="/settings/payments-kyc"]')).toBeNull();
  });

  it('gives the transfer combobox an accessible name', () => {
    setup();
    c().open('transfer'); fixture.detectChanges();
    expect(el().querySelector('input[role="combobox"]')!.getAttribute('placeholder')).toContain('admin.bookingsEmi.field.target');
  });
});
