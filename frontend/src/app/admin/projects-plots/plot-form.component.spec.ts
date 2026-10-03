import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotFormComponent } from './plot-form.component';
import { Plot, PlotRequest } from '../../setup/models/project.model';

describe('PlotFormComponent', () => {
  let fixture: ComponentFixture<PlotFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const plot: Plot = { id: 'x', plotNo: 'A-1', plotType: 'CORNER', areaSqft: 1800, rate: 2850, price: 5130000, status: 'AVAILABLE' };

  function setup(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [PlotFormComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(PlotFormComponent);
    for (const [k, v] of Object.entries({ plot: null, locked: false, busy: false, duplicatePlotNo: false, ...inputs })) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }
  const type = (name: string, value: string) => {
    const input = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('emits a PlotRequest for a valid new plot with status AVAILABLE', async () => {
    setup();
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    await fixture.whenStable(); // let ngModel finish its async init so it doesn't overwrite typed values
    type('plotNo', 'C-9'); type('areaSqft', '1200'); type('rate', '3000'); type('price', '3600000');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out).toEqual([{ plotNo: 'C-9', plotType: 'NORMAL', areaSqft: 1200, rate: 3000, price: 3600000, status: 'AVAILABLE' }]);
  });

  it('blocks submit and shows required errors when fields are empty or non-positive', async () => {
    setup();
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    type('areaSqft', '0');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(out.length).toBe(0);
    expect(el().querySelectorAll('.field-error').length).toBeGreaterThan(0);
  });

  it('prefills when editing and keeps the current status in the request', async () => {
    setup({ plot });
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out[0]).toEqual({ plotNo: 'A-1', plotType: 'CORNER', areaSqft: 1800, rate: 2850, price: 5130000, status: 'AVAILABLE' });
  });

  it('renders the locked variant with no inputs and a back button', () => {
    setup({ plot: { ...plot, status: 'BOOKED' }, locked: true });
    expect(el().querySelector('input')).toBeNull();
    expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
    let backed = false;
    fixture.componentInstance.cancelled.subscribe(() => (backed = true));
    el().querySelector<HTMLButtonElement>('.plot-form__back')!.click();
    expect(backed).toBeTrue();
  });

  it('shows the duplicate plot number error on the plotNo field', () => {
    setup({ duplicatePlotNo: true });
    expect(el().textContent).toContain('admin.projectsPlots.error.duplicatePlotNo');
  });
});
