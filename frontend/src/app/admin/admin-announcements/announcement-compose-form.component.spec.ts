import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AnnouncementComposeFormComponent } from './announcement-compose-form.component';

describe('AnnouncementComposeFormComponent', () => {
  let fixture: ComponentFixture<AnnouncementComposeFormComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const titleIn = () => el().querySelector<HTMLInputElement>('#announcement-composer-title')!;
  const bodyIn = () => el().querySelector<HTMLTextAreaElement>('#announcement-composer-body')!;
  const type = (e: HTMLInputElement | HTMLTextAreaElement, v: string) => { e.value = v; e.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const submit = () => { el().querySelector('form')!.dispatchEvent(new Event('submit')); fixture.detectChanges(); };
  const publishBtn = () => el().querySelector<HTMLButtonElement>('.announcement-composer__publish')!;
  const clearBtn = () => el().querySelector<HTMLButtonElement>('.announcement-composer__clear')!;
  const created = (over: Record<string, unknown> = {}) => ({ id: 'a1', title: 'T', body: 'B', publishedAt: '2026-10-09T08:00:00Z', ...over });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnnouncementComposeFormComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(AnnouncementComposeFormComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('always shows the permanent warning and has no confirm step, edit or schedule controls', () => {
    expect(el().textContent).toContain('announcements.composer.form.warnTitle');
    expect(el().querySelector('.inline-banner__dismiss')).toBeNull();
    expect(el().querySelectorAll('button').length).toBe(2); // Publish + Clear only
  });

  it('counts the title as "n / 300" and turns the counter danger above 300 without a maxlength', () => {
    expect(el().querySelector('.announcement-composer__counter')!.textContent!.trim()).toBe('0 / 300');
    type(titleIn(), 'x'.repeat(301));
    const c = el().querySelector('.announcement-composer__counter')!;
    expect(c.textContent!.trim()).toBe('301 / 300');
    expect(c.classList).toContain('announcement-composer__counter--over');
    expect(titleIn().hasAttribute('maxlength')).toBeFalse();
    expect(titleIn().value.length).toBe(301);
  });

  it('blank submit sends nothing, shows both messages with aria-invalid, and focuses the first invalid field', () => {
    type(titleIn(), '   '); type(bodyIn(), '\n ');
    submit();
    expect(el().textContent).toContain('announcements.composer.err.titleRequired');
    expect(el().textContent).toContain('announcements.composer.err.bodyRequired');
    expect(titleIn().getAttribute('aria-invalid')).toBe('true');
    expect(bodyIn().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(titleIn());
  });

  it('301 characters is rejected client-side with no request; exactly 300 is sent', () => {
    type(titleIn(), 'x'.repeat(301)); type(bodyIn(), 'b');
    submit();
    expect(el().textContent).toContain('announcements.composer.err.titleTooLong');
    http.expectNone('/api/admin/announcements');
    type(titleIn(), 'x'.repeat(300));
    submit();
    http.expectOne('/api/admin/announcements').flush(created(), { status: 201, statusText: 'Created' });
  });

  it('publishes trimmed text, then clears, resets the counter, emits published and returns focus to the title', () => {
    const spy = jasmine.createSpy('published'); fixture.componentInstance.published.subscribe(spy);
    type(titleIn(), '  Office closed  '); type(bodyIn(), 'Line 1\n\nLine 2 ');
    publishBtn().focus();
    submit();
    const r = http.expectOne('/api/admin/announcements');
    expect(r.request.body).toEqual({ title: 'Office closed', body: 'Line 1\n\nLine 2' });
    r.flush(created({ title: 'Office closed' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(titleIn().value).toBe('');
    expect(bodyIn().value).toBe('');
    expect(el().querySelector('.announcement-composer__counter')!.textContent!.trim()).toBe('0 / 300');
    expect(el().querySelector('.field-error')).toBeNull();
    expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'a1' }));
    expect(document.activeElement).toBe(titleIn());
  });

  it('while publishing: aria-disabled (not disabled) buttons, readOnly (not disabled) fields, focus kept, one POST only', () => {
    const busy = jasmine.createSpy('busy'); fixture.componentInstance.busyChange.subscribe(busy);
    type(titleIn(), 'T'); type(bodyIn(), 'B');
    titleIn().focus();
    submit(); submit(); // double submit
    expect(publishBtn().disabled).toBeFalse();
    expect(publishBtn().getAttribute('aria-disabled')).toBe('true');
    expect(clearBtn().disabled).toBeFalse();
    expect(clearBtn().getAttribute('aria-disabled')).toBe('true');
    expect(titleIn().disabled).toBeFalse();
    expect(titleIn().readOnly).toBeTrue();
    expect(bodyIn().readOnly).toBeTrue();
    expect(document.activeElement).toBe(titleIn());
    expect(publishBtn().textContent).toContain('announcements.composer.form.publishing');
    clearBtn().click(); // Clear is inert while busy
    expect(titleIn().value).toBe('T');
    http.expectOne('/api/admin/announcements').flush(created(), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(busy.calls.allArgs()).toEqual([[true], [false]]);
    expect(publishBtn().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('a server 400 shows the per-field message in the same slot and keeps the text', () => {
    type(titleIn(), 'T'); type(bodyIn(), 'B');
    submit();
    http.expectOne('/api/admin/announcements').flush({ error: 'validation failed', fields: { title: 'size must be between 0 and 300' } }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(el().textContent).toContain('size must be between 0 and 300');
    expect(titleIn().getAttribute('aria-invalid')).toBe('true');
    expect(titleIn().value).toBe('T');
    expect(el().querySelector('.announcement-composer__failed')).toBeNull();
  });

  it('a network or 5xx failure keeps the text, shows the "nothing was sent" banner, and a second Publish retries', () => {
    type(titleIn(), 'T'); type(bodyIn(), 'B');
    submit();
    http.expectOne('/api/admin/announcements').flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__failed')!.textContent).toContain('announcements.composer.err.publish');
    expect(titleIn().value).toBe('T');
    expect(bodyIn().value).toBe('B');
    submit();
    expect(el().querySelector('.announcement-composer__failed')).toBeNull();
    http.expectOne('/api/admin/announcements').flush(created(), { status: 201, statusText: 'Created' });
  });

  it('Clear empties both fields, errors and counter and focuses the title', () => {
    type(titleIn(), 'T'); type(bodyIn(), 'B'); submit();
    http.expectOne('/api/admin/announcements').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    clearBtn().click(); fixture.detectChanges();
    expect(titleIn().value).toBe('');
    expect(el().querySelector('.announcement-composer__failed')).toBeNull();
    expect(document.activeElement).toBe(titleIn());
  });

  it('keeps live-region roles tight: no aria-live on the panel, role=alert only on error text', () => {
    const seal = el().querySelector('.announcement-composer__seal')!;
    expect(seal.hasAttribute('aria-live')).toBeFalse();
    expect(seal.hasAttribute('role')).toBeFalse();
    type(titleIn(), 'T'); type(bodyIn(), 'B'); submit();
    http.expectOne('/api/admin/announcements').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    const alerts = Array.from(el().querySelectorAll('[role="alert"]'));
    expect(alerts.some(a => a.classList.contains('announcement-composer__failed'))).toBeTrue();
    expect(alerts.every(a => a.tagName === 'SPAN' || a.tagName === 'DIV')).toBeTrue();
    expect(el().querySelector('form')!.hasAttribute('role')).toBeFalse();
  });

  it('renders typed script text as inert characters (interpolation only)', () => {
    type(titleIn(), '<img src=x onerror=alert(1)>'); type(bodyIn(), 'B');
    expect(el().querySelector('img')).toBeNull();
  });
});
