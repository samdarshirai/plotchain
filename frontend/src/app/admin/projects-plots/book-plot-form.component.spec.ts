import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BookPlotFormComponent } from './book-plot-form.component';
import { BookingFormValue } from './projects-plots.model';

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
    fixture.detectChanges();
  }
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
    submitForm();
    expect(out).toEqual([{ associateId: 'a1', buyerName: 'Rohit Kulkarni', buyerPhone: '9876543210' }]);
  });

  it('shows the equal-split preview when EMI is on', () => {
    setup();
    expect(el().textContent).toContain('admin.projectsPlots.schedulePreview');
  });

  it('shows the single-installment line when EMI is off, and no preview when config is unreadable', () => {
    setup({ emiEnabled: false, defaultInstallmentCount: 1 });
    expect(el().textContent).toContain('admin.projectsPlots.scheduleSingle');
    TestBed.resetTestingModule();
    setup(null);
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
    submitForm();
    expect(out.length).toBe(0);
  });
});
