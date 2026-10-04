import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectFormComponent } from './project-form.component';

describe('ProjectFormComponent', () => {
  let fixture: ComponentFixture<ProjectFormComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProjectFormComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ProjectFormComponent);
    fixture.componentRef.setInput('project', null);
    fixture.componentRef.setInput('busy', false);
    fixture.detectChanges();
  });

  const type = (name: string, value: string) => {
    const input = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('emits the trimmed request with no photo when none chosen', async () => {
    const out: unknown[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    await fixture.whenStable(); // let ngModel finish its async init so it doesn't overwrite typed values
    type('name', '  Lake View '); type('location', 'Pune');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out).toEqual([{ request: { name: 'Lake View', location: 'Pune' }, photo: null }]);
  });

  it('keeps typed edits when busy changes', async () => {
    fixture.componentRef.setInput('project', { id: 'p', name: 'Old', location: 'Pune' });
    fixture.detectChanges();
    const out: { request: { name: string } }[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v as never));
    await fixture.whenStable();
    type('name', 'Typed');
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    fixture.componentRef.setInput('busy', false); fixture.detectChanges();
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out[0].request.name).toBe('Typed');
  });

  it('does not emit when the name is blank', async () => {
    const out: unknown[] = [];
    fixture.componentInstance.submitted.subscribe(v => out.push(v));
    await fixture.whenStable();
    type('name', '   '); type('location', 'Pune');
    await fixture.whenStable();
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    expect(out.length).toBe(0);
  });
});
