import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotFormComponent } from './plot-form.component';
import { Plot, PlotRequest } from '../../setup/models/project.model';

describe('PlotFormComponent', () => {
  let fixture: ComponentFixture<PlotFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const plot: Plot = { id: 'x', plotNo: 'A-1', plotType: 'CORNER', areaSqft: 1800, rate: 2850, price: 5130000, extraPrice: 0, status: 'AVAILABLE' };

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
    type('plotNo', 'C-9'); type('areaSqft', '1200'); type('rate', '3000');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out).toEqual([{ plotNo: 'C-9', plotType: 'NORMAL', areaSqft: 1200, rate: 3000, price: 3600000, extraPercent: 0, roadSizeFt: null, status: 'AVAILABLE' }]);
  });

  it('includes the optional road size when entered', async () => {
    setup();
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    await fixture.whenStable();
    type('plotNo', 'C-9'); type('areaSqft', '1200'); type('rate', '3000'); type('roadSizeFt', '30');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out[0].roadSizeFt).toBe(30);
  });

  it('blocks submit and shows required errors when fields are empty or non-positive', async () => {
    setup();
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    await fixture.whenStable();
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
    expect(out[0]).toEqual({ plotNo: 'A-1', plotType: 'CORNER', areaSqft: 1800, rate: 2850, price: 5130000, extraPercent: 0, roadSizeFt: null, status: 'AVAILABLE' });
  });

  it('keeps typed edits when busy or duplicatePlotNo inputs change', async () => {
    setup({ plot });
    const out: PlotRequest[] = [];
    fixture.componentInstance.submitted.subscribe(r => out.push(r));
    await fixture.whenStable();
    type('plotNo', 'Z-5');
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    fixture.componentRef.setInput('busy', false);
    fixture.componentRef.setInput('duplicatePlotNo', true); fixture.detectChanges();
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out[0].plotNo).toBe('Z-5');
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

  describe('plot types and stacked Extra %', () => {
    const defaults = { corner: 10, parkFacing: 5, roadSide: 5 };
    const pick = async (t: string) => {
      const select = el().querySelector<HTMLSelectElement>('select[name="plotType"]')!;
      select.value = select.querySelector<HTMLOptionElement>(`option[value="${t}"]`)!.value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const extraInput = () => el().querySelector<HTMLInputElement>('[name="extraPercent"]')!;

    it('offers the six plot types in a dropdown', () => {
      setup({ extraDefaults: defaults });
      const values = Array.from(el().querySelectorAll<HTMLOptionElement>('select[name="plotType"] option')).map(o => o.value);
      expect(values).toEqual(['NORMAL', 'CORNER', 'PARK_FACING', 'ROAD_SIDE', 'CORNER_PARK_FACING', 'CORNER_ROAD_SIDE']);
    });

    it('prefills the stacked default when Corner + Park Facing is picked', async () => {
      setup({ extraDefaults: defaults });
      await fixture.whenStable();
      await pick('CORNER_PARK_FACING');
      expect(Number(extraInput().value)).toBe(15);
      const hint = extraInput().parentElement!.querySelector('small')!.textContent!;
      expect(hint).toContain('10% + ');
      expect(hint).toContain('5%');
    });

    it('prefills 0 for Normal and the road default for Road Side', async () => {
      setup({ extraDefaults: { corner: 10, parkFacing: 5, roadSide: 7 } });
      await fixture.whenStable();
      await pick('ROAD_SIDE');
      expect(Number(extraInput().value)).toBe(7);
      await pick('NORMAL');
      expect(Number(extraInput().value)).toBe(0);
    });

    it('keeps a typed override until the type changes', async () => {
      setup({ extraDefaults: defaults });
      const out: PlotRequest[] = [];
      fixture.componentInstance.submitted.subscribe(r => out.push(r));
      await fixture.whenStable();
      await pick('CORNER');
      type('plotNo', 'C-9'); type('areaSqft', '1200'); type('rate', '3000'); type('extraPercent', '12');
      await fixture.whenStable();
      el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      expect(out[0].plotType).toBe('CORNER');
      expect(out[0].extraPercent).toBe(12);
    });

    it('blocks submit when the stacked default exceeds 100', async () => {
      setup({ extraDefaults: { corner: 98, parkFacing: 5, roadSide: 5 } });
      const out: PlotRequest[] = [];
      fixture.componentInstance.submitted.subscribe(r => out.push(r));
      await fixture.whenStable();
      await pick('CORNER_PARK_FACING');
      type('plotNo', 'C-9'); type('areaSqft', '1200'); type('rate', '3000');
      await fixture.whenStable();
      el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(out.length).toBe(0);
      expect(fixture.componentInstance.issues.map(i => i.id)).toContain('extraPercent');
    });

    it("keeps an edited plot's saved percent until its type changes", async () => {
      setup({ extraDefaults: defaults, plot: { ...plot, plotType: 'PARK_FACING', extraPercent: 8 } });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(Number(extraInput().value)).toBe(8);
    });
  });
});

