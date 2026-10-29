import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BookPlotFormComponent } from './book-plot-form.component';
import { BookingFormValue } from './projects-plots.model';
import { formatInr } from '../../shared/utils/plot-grid.util';

describe('BookPlotFormComponent', () => {
  let fixture: ComponentFixture<BookPlotFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const associates = [{ id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE' as const, hasFreeSlot: true }];
  const plot = { plotId: 'x', plotNo: 'A-12', type: 'NORMAL' as const, area: 1800, price: 5130000, status: 'AVAILABLE' as const };

  function setup(emi: unknown = { emiEnabled: true, defaultInstallmentCount: 6 }, busy = false) {
    TestBed.configureTestingModule({ imports: [BookPlotFormComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(BookPlotFormComponent);
    fixture.componentRef.setInput('plot', plot);
    fixture.componentRef.setInput('associates', associates);
    fixture.componentRef.setInput('emiConfig', emi);
    fixture.componentRef.setInput('busy', busy);
    // Payment fields are mandatory; default them so existing cases reach the emit.
    Object.assign(fixture.componentInstance, { paymentMode: 'CASH', txnNo: 'T1', txnDate: fixture.componentInstance.today });
    fixture.detectChanges();
  }
  const pay = { paymentMode: 'CASH', txnNo: 'T1', bankName: '', txnDate: new Date().toISOString().slice(0, 10), firstInstallmentAmount: undefined };
  const submitForm = () => el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
  const typeInto = (name: string, v: string) => {
    const i = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    i.value = v; i.dispatchEvent(new Event('input'));
  };

  it('blocks submit with a blank buyer name, flags the field and moves focus to it', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    await fixture.whenStable();
    typeInto('buyerName', '   ');
    submitForm();
    fixture.detectChanges();
    const field = el().querySelector<HTMLInputElement>('[name="buyerName"]')!;
    expect(out.length).toBe(0);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(el().textContent).toContain('admin.projectsPlots.buyerNameRequired');
    expect(document.activeElement).toBe(field);
  });

  it('requires an associate', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    await fixture.whenStable();
    typeInto('buyerName', 'Rohit');
    submitForm();
    fixture.detectChanges();
    expect(out.length).toBe(0);
    expect(el().textContent).toContain('admin.projectsPlots.associateRequired');
  });

  it('emits the trimmed value when valid', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    await fixture.whenStable();
    typeInto('buyerName', '  Rohit Kulkarni ');
    typeInto('buyerPhone', ' 9876543210 ');
    typeInto('tokenAmount', '100000');
    submitForm();
    expect(out).toEqual([{ associateId: 'a1', buyerName: 'Rohit Kulkarni', buyerPhone: '9876543210', tokenAmount: 100000, discount: 0, extraPrice: 0, extraPercent: 0, ...pay }]);
  });

  it('blocks submit without a token amount and flags the field', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    await fixture.whenStable();
    typeInto('buyerName', 'Rohit');
    submitForm();
    fixture.detectChanges();
    const field = el().querySelector<HTMLInputElement>('[name="tokenAmount"]')!;
    expect(out.length).toBe(0);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(el().textContent).toContain('admin.projectsPlots.token.required');
    expect(document.activeElement).toBe(field);
  });

  it('rejects a token equal to or above the plot price, and zero', async () => {
    setup();
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    await fixture.whenStable();
    typeInto('buyerName', 'Rohit');
    typeInto('tokenAmount', String(plot.price));
    submitForm();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.token.tooHigh');
    typeInto('tokenAmount', '0');
    submitForm();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.token.required');
    expect(out.length).toBe(0);
  });

  it('shows the token-then-balance preview once a valid token is typed and EMI is on', async () => {
    setup();
    await fixture.whenStable(); // ngModel's first write is async and would clear a value typed before it
    expect(el().textContent).not.toContain('admin.projectsPlots.schedulePreview');
    typeInto('tokenAmount', '100000');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.schedulePreview');
  });

  it('shows the single-balance line when EMI is off, and no preview when config is unreadable', async () => {
    setup({ emiEnabled: false, defaultInstallmentCount: 1 });
    await fixture.whenStable();
    typeInto('tokenAmount', '100000');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.scheduleSingle');
    TestBed.resetTestingModule();
    setup(null);
    await fixture.whenStable();
    typeInto('tokenAmount', '100000');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().textContent).not.toContain('admin.projectsPlots.schedulePreview');
    expect(el().textContent).not.toContain('admin.projectsPlots.scheduleSingle');
  });

  it('disables inputs and the submit button, and marks it busy, while submitting', async () => {
    setup(undefined, true);
    await fixture.whenStable(); // ngModel applies [disabled] asynchronously
    const btn = el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(btn.disabled).toBeTrue();
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector<HTMLInputElement>('[name="buyerName"]')!.disabled).toBeTrue();
    // Cancel stays enabled while in flight (the request still completes; see container spec).
    expect(el().querySelector<HTMLButtonElement>('.book-form__cancel')!.disabled).toBeFalse();
  });

  it('does not emit twice when submitted again while busy', async () => {
    setup(undefined, true);
    const out: BookingFormValue[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    fixture.componentInstance.associateId = 'a1';
    fixture.componentInstance.buyerName = 'Rohit';
    fixture.componentInstance.tokenAmount = 100000;
    submitForm();
    expect(out.length).toBe(0);
  });

  describe('discount', () => {
    const K = 'admin.projectsPlots.';
    async function ready() {
      setup();
      const out: BookingFormValue[] = [];
      fixture.componentInstance.submitted.subscribe(v => out.push(v));
      fixture.componentInstance.associateId = 'a1';
      await fixture.whenStable();
      typeInto('buyerName', 'Rohit');
      return out;
    }
    const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };

    it('shows no summary and emits discount 0 when the discount is blank', async () => {
      const out = await ready();
      typeInto('tokenAmount', '100000');
      submitForm(); await settle();
      expect(out[0].discount).toBe(0);
    });

    it('live total: typing 130000 shows the Total after discount = 5,000,000', async () => {
      await ready();
      typeInto('discount', '130000'); await settle();
      const box = el().querySelector('.book-form__total-line')!;
      expect(box.getAttribute('aria-live')).toBe('polite');
      expect(box.textContent).toContain(K + 'summary.total');
      expect(box.textContent).toContain(formatInr(5000000));
    });

    it('rejects a negative discount (flags field, focuses it, no emit)', async () => {
      const out = await ready();
      typeInto('discount', '-1'); typeInto('tokenAmount', '100000');
      submitForm(); await settle();
      const f = el().querySelector<HTMLInputElement>('[name="discount"]')!;
      expect(out.length).toBe(0);
      expect(f.getAttribute('aria-invalid')).toBe('true');
      expect(el().textContent).toContain(K + 'discount.negative');
      expect(document.activeElement).toBe(f);
    });

    it('rejects a discount equal to the plot price; accepts price - 0.01', async () => {
      const out = await ready();
      typeInto('tokenAmount', '0.005');
      typeInto('discount', String(plot.price));
      submitForm(); await settle();
      expect(el().textContent).toContain(K + 'discount.tooHigh');
      expect(out.length).toBe(0);
      typeInto('discount', String(plot.price - 0.01));
      submitForm(); await settle();
      expect(el().textContent).not.toContain(K + 'discount.tooHigh');
      expect(out.length).toBe(1);
    });

    it('rounds the discount to 2dp before validating and emitting', async () => {
      const out = await ready();
      typeInto('discount', '1000.005'); typeInto('tokenAmount', '100000');
      submitForm();
      expect(out[0].discount).toBe(1000.01);
    });

    it('token must be below the discounted total', async () => {
      const out = await ready();
      typeInto('discount', '130000'); typeInto('tokenAmount', '5000000');
      submitForm(); await settle();
      expect(el().textContent).toContain(K + 'token.tooHigh');
      expect(out.length).toBe(0);
      typeInto('tokenAmount', '4999999.99');
      submitForm(); await settle();
      expect(out.length).toBe(1);
    });

    it('changing the discount after the token re-validates the token', async () => {
      const out = await ready();
      typeInto('tokenAmount', '5100000');
      typeInto('discount', '130000');
      submitForm(); await settle();
      expect(out.length).toBe(0);
      expect(el().textContent).toContain(K + 'token.tooHigh');
    });

    it('instalment preview uses the discounted total', async () => {
      await ready();
      typeInto('discount', '130000'); typeInto('tokenAmount', '500000'); await settle();
      expect(fixture.componentInstance.previewParams.amount).toBe(formatInr(900000));
    });

    it('rounds half-up at 2dp on boundaries (matches server BigDecimal HALF_UP)', async () => {
      await ready();
      const c = fixture.componentInstance;
      for (const [raw, want] of [[1.005, 1.01], [1000.005, 1000.01], [0.005, 0.01], [-0.005, -0.01]]) {
        c.discountRaw = raw;
        expect(c.discount).toBe(want);
      }
    });

    it('treats -0.005 as a negative discount, not zero', async () => {
      const out = await ready();
      typeInto('discount', '-0.005'); typeInto('tokenAmount', '100000');
      submitForm(); await settle();
      expect(el().textContent).toContain(K + 'discount.negative');
      expect(out.length).toBe(0);
    });

    it('shows no summary before submit when the discount is >= the price or negative', async () => {
      await ready();
      typeInto('discount', String(plot.price)); await settle();
      expect(el().textContent).not.toContain(K + 'discount.tooHigh'); // error still waits for submit
      typeInto('discount', String(plot.price + 1000)); await settle();
      typeInto('discount', '-5'); await settle();
    });

    it('with an invalid discount the instalment preview falls back to the list price and no summary shows', async () => {
      await ready();
      typeInto('discount', String(plot.price + 1)); typeInto('tokenAmount', '500000'); await settle();
      expect(fixture.componentInstance.previewParams.amount).toBe(formatInr(Math.round((plot.price - 500000) / 5)));
    });

    it('emits discount alongside associate, buyer and token on a valid submit', async () => {
      const out = await ready();
      typeInto('discount', '130000'); typeInto('tokenAmount', '100000');
      submitForm();
      expect(out).toEqual([{ associateId: 'a1', buyerName: 'Rohit', buyerPhone: '', tokenAmount: 100000, discount: 130000, extraPrice: 0, extraPercent: 0, ...pay }]);
    });
  });

  it('fills the associate name from a typed ID and flags an unknown ID', async () => {
    setup();
    await fixture.whenStable();
    typeInto('associateUserId', 'vp00001');
    fixture.detectChanges();
    expect(fixture.componentInstance.associateId).toBe('a1');
    expect(el().querySelector<HTMLInputElement>('[name="associateName"]')!.value).toBe('Jane');
    typeInto('associateUserId', 'nope');
    fixture.detectChanges();
    expect(fixture.componentInstance.associateId).toBe('');
    expect(el().textContent).toContain('admin.projectsPlots.associateNotFound');
  });

  it('requires a bank name for bank transfer and cheque but not cash', async () => {
    setup();
    const c = fixture.componentInstance;
    const out: BookingFormValue[] = [];
    c.submitted.subscribe(v => out.push(v));
    c.associateId = 'a1';
    await fixture.whenStable();
    typeInto('buyerName', 'Rohit'); typeInto('tokenAmount', '100000');
    c.paymentMode = 'BANK_TRANSFER';
    submitForm();
    expect(out.length).toBe(0);
    c.bankName = 'HDFC';
    submitForm();
    expect(out.length).toBe(1);
    expect(out[0].bankName).toBe('HDFC');
  });

  it('rejects a first installment larger than the balance after the booking amount', async () => {
    setup();
    const c = fixture.componentInstance;
    typeInto('tokenAmount', '100000');
    c.firstInstallmentAmount = 99999999;
    expect(c.firstError).toBeTrue();
    c.firstInstallmentAmount = 500000;
    expect(c.firstError).toBeFalse();
  });
});
