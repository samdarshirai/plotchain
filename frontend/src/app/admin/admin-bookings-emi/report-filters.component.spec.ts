import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ReportFiltersComponent, ReportFilterValue } from './report-filters.component';

describe('ReportFiltersComponent', () => {
  let fixture: ComponentFixture<ReportFiltersComponent>;
  let http: HttpTestingController;
  let emitted: ReportFilterValue[];
  const el = () => fixture.nativeElement as HTMLElement;
  const input = (name: string, v: string) => { const i = el().querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!; i.value = v; i.dispatchEvent(new Event('change')); fixture.detectChanges(); };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReportFiltersComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ReportFiltersComponent);
    http = TestBed.inject(HttpTestingController);
    emitted = [];
    fixture.componentInstance.filtersChange.subscribe(v => emitted.push(v));
    fixture.detectChanges();
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('lists projects and emits the full value when the project changes', () => {
    input('projectId', 'p1');
    expect(emitted.at(-1)).toEqual({ from: '', to: '', projectId: 'p1' });
  });
  it('emits a one-sided date range', () => {
    input('from', '2026-03-01');
    expect(emitted.at(-1)).toEqual({ from: '2026-03-01', to: '', projectId: '' });
  });
  it('shows the range error and emits nothing when From is after To', () => {
    input('from', '2026-03-10');
    emitted.length = 0;
    input('to', '2026-03-01');
    expect(emitted.length).toBe(0);
    expect(el().textContent).toContain('admin.bookingsEmi.validation.range');
  });
  it('clears the range error once the range is valid again', () => {
    input('from', '2026-03-10'); input('to', '2026-03-01'); input('to', '2026-03-12');
    expect(el().textContent).not.toContain('admin.bookingsEmi.validation.range');
    expect(emitted.at(-1)).toEqual({ from: '2026-03-10', to: '2026-03-12', projectId: '' });
  });
  it('Reset clears everything and emits the empty value', () => {
    input('projectId', 'p1');
    el().querySelector<HTMLButtonElement>('.report-filters__reset')!.click();
    expect(emitted.at(-1)).toEqual({ from: '', to: '', projectId: '' });
  });
  it('disables every control while locked', () => {
    fixture.componentRef.setInput('locked', true); fixture.detectChanges();
    el().querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button').forEach(c => expect(c.disabled).toBeTrue());
  });
  it('still renders when the project list fails to load', () => {
    const f2 = TestBed.createComponent(ReportFiltersComponent);
    f2.detectChanges();
    http.expectOne('/api/company/projects').flush('x', { status: 500, statusText: 'err' });
    f2.detectChanges();
    expect(f2.nativeElement.querySelector('[name="projectId"]')).not.toBeNull();
  });
});
