import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TicketSealComponent } from './ticket-seal.component';

// helpers hoisted so the log `describe` reuses them
let fixture: ComponentFixture<TicketSealComponent>;
let http: HttpTestingController;
const el = () => fixture.nativeElement as HTMLElement;
const tk = (over: Record<string, unknown> = {}) => ({
  id: 't1', associateId: 'a1', associateUserId: 'VA-1', associateName: 'Jane', subject: 'Printer', description: 'Line one\nLine two',
  status: 'OPEN', response: null, respondedAt: null, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', ...over
});
const submit = () => el().querySelector<HTMLFormElement>('form.ticket-seal__form')!.dispatchEvent(new Event('submit'));
async function setup(mode: 'respond' | 'log', directory: unknown[] = []) {
  await TestBed.configureTestingModule({ imports: [TicketSealComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
  fixture = TestBed.createComponent(TicketSealComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('directory', directory);
  fixture.componentRef.setInput('filterMismatch', false);
  http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
}

describe('TicketSealComponent (respond)', () => {
  const setTicket = (t: unknown) => { fixture.componentRef.setInput('ticket', t); fixture.detectChanges(); };
  const pick = (status: string) => { fixture.componentInstance.status = status as never; fixture.detectChanges(); };
  const typeReply = (v: string) => { fixture.componentInstance.reply = v; fixture.detectChanges(); };

  beforeEach(() => setup('respond'));
  afterEach(() => http.verify());

  it('shows the none message with no ticket', () => {
    expect(el().textContent).toContain('admin.supportTickets.seal.none');
  });

  it('presets the status to the ticket status, shows the current reply or the no-reply text', () => {
    setTicket(tk({ status: 'IN_PROGRESS', response: 'Looking', respondedAt: '2026-03-02T00:00:00Z' }));
    expect(fixture.componentInstance.status).toBe('IN_PROGRESS');
    expect(el().querySelector('.ticket-seal__reply-quote')!.textContent).toContain('Looking');
    setTicket(tk({ id: 't2' }));
    expect(el().textContent).toContain('admin.supportTickets.seal.noReply');
  });

  it('marks Reply required only while Resolved or Closed is selected', () => {
    setTicket(tk());
    expect(el().querySelector('.ticket-seal__req')).toBeNull();
    pick('RESOLVED');
    expect(el().querySelector('.ticket-seal__req')).not.toBeNull();
  });

  it('blank reply on RESOLVED/CLOSED sends nothing and shows the field error', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('   ');
    submit(); fixture.detectChanges();
    http.expectNone('/api/admin/support-tickets/t1/respond');
    expect(el().textContent).toContain('admin.supportTickets.err.replyRequired');
    expect(el().querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
    pick('CLOSED');
    submit(); http.expectNone('/api/admin/support-tickets/t1/respond');
  });

  it('status-only change posts without a response and emits saved + flash', () => {
    setTicket(tk({ response: 'Old' }));
    const saved = jasmine.createSpy('saved'); const flash = jasmine.createSpy('flash');
    fixture.componentInstance.saved.subscribe(saved); fixture.componentInstance.flash.subscribe(flash);
    pick('IN_PROGRESS'); typeReply('');
    submit();
    const r = http.expectOne('/api/admin/support-tickets/t1/respond');
    expect(r.request.body).toEqual({ status: 'IN_PROGRESS' });
    r.flush(tk({ status: 'IN_PROGRESS', response: 'Old' }));
    expect(saved).toHaveBeenCalled();
    expect(flash).toHaveBeenCalledWith({ key: 'admin.supportTickets.ok.responded', params: { subject: 'Printer', status: 'admin.supportTickets.status.IN_PROGRESS' } });
  });

  it('ignores a second submit while the first is in flight and emits busy true then false', () => {
    setTicket(tk());
    const busy = jasmine.createSpy('busy'); fixture.componentInstance.busyChange.subscribe(busy);
    pick('RESOLVED'); typeReply('Done');
    submit(); submit();
    const r = http.expectOne('/api/admin/support-tickets/t1/respond');
    expect(busy).toHaveBeenCalledWith(true);
    r.flush(tk({ status: 'RESOLVED', response: 'Done' }));
    expect(busy).toHaveBeenCalledWith(false);
  });

  it('surfaces a server 400 as the reply error plus the server text, keeping the form input', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('x');
    submit();
    http.expectOne('/api/admin/support-tickets/t1/respond').flush({ error: 'Response is required when resolving' }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.supportTickets.err.replyRequired');
    expect(el().textContent).toContain('Response is required when resolving');
    expect(fixture.componentInstance.reply).toBe('x');
  });

  it('respond 404 shows the not-found banner and requests a queue reload', () => {
    setTicket(tk());
    const reload = jasmine.createSpy('reload'); fixture.componentInstance.reloadRequested.subscribe(reload);
    pick('CLOSED'); typeReply('bye');
    submit();
    http.expectOne('/api/admin/support-tickets/t1/respond').flush({ error: 'nope' }, { status: 404, statusText: 'NF' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.supportTickets.err.ticketNotFound');
    expect(reload).toHaveBeenCalled();
  });

  it('switching to another ticket resets the form and clears errors', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('');
    submit(); fixture.detectChanges();
    setTicket(tk({ id: 't2', status: 'CLOSED', response: 'R' }));
    expect(fixture.componentInstance.status).toBe('CLOSED');
    expect(fixture.componentInstance.reply).toBe('');
    expect(el().textContent).not.toContain('admin.supportTickets.err.replyRequired');
  });

  it('keeps the submit button focusable (aria-disabled, not disabled) while busy and keeps focus after save', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('Done');
    const btn = el().querySelector<HTMLButtonElement>('.ticket-seal__submit')!;
    btn.focus();
    submit();
    fixture.detectChanges();
    expect(btn.disabled).toBeFalse();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(btn);
    http.expectOne('/api/admin/support-tickets/t1/respond').flush(tk({ status: 'RESOLVED', response: 'Done' }));
    fixture.detectChanges();
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
    expect(document.activeElement).toBe(btn);
  });

  it('keeps focus on the reply box while a submit from it is in flight and after an error', () => {
    setTicket(tk());
    pick('RESOLVED'); typeReply('Done');
    const ta = el().querySelector<HTMLTextAreaElement>('textarea')!;
    ta.focus();
    submit(); fixture.detectChanges();
    expect(ta.disabled).toBeFalse();
    expect(ta.readOnly).toBeTrue();
    expect(document.activeElement).toBe(ta);
    http.expectOne('/api/admin/support-tickets/t1/respond').flush({ error: 'x' }, { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(document.activeElement).toBe(ta);
  });

  it('does not announce the whole seal as a live region', () => {
    setTicket(tk());
    expect(el().querySelector('.ticket-seal')!.hasAttribute('aria-live')).toBeFalse();
    fixture.componentRef.setInput('filterMismatch', true); fixture.detectChanges();
    expect(el().querySelector('.ticket-seal__note')!.getAttribute('role')).toBe('status');
  });

  it('shows the filter-mismatch note when told', () => {
    fixture.componentRef.setInput('filterMismatch', true);
    setTicket(tk());
    expect(el().textContent).toContain('admin.supportTickets.seal.filterMismatch');
  });
});

describe('TicketSealComponent (log)', () => {
  const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];
  const fill = (a = 'a1', s = 'Printer', d = 'Jammed') => { const c = fixture.componentInstance; c.associateId = a; c.subject = s; c.description = d; fixture.detectChanges(); };

  beforeEach(() => setup('log', dir));
  afterEach(() => http.verify());

  it('missing associate, subject or description sends nothing and shows the required message', () => {
    fill('', 'x', 'y'); submit(); http.expectNone('/api/admin/support-tickets');
    fill('a1', '   ', 'y'); submit(); http.expectNone('/api/admin/support-tickets');
    fill('a1', 'x', '  '); submit(); fixture.detectChanges();
    http.expectNone('/api/admin/support-tickets');
    expect(el().textContent).toContain('admin.supportTickets.err.logRequired');
  });

  it('subject input caps at 200 characters and a longer programmatic subject is blocked', () => {
    expect(el().querySelector('input[name=subject]')!.getAttribute('maxlength')).toBe('200');
    fill('a1', 'x'.repeat(201), 'y'); submit(); http.expectNone('/api/admin/support-tickets');
  });

  it('posts trimmed fields, then emits logged + flash with the associate name and userId', () => {
    const logged = jasmine.createSpy('logged'); const flash = jasmine.createSpy('flash');
    fixture.componentInstance.logged.subscribe(logged); fixture.componentInstance.flash.subscribe(flash);
    fill('a1', '  Printer  ', ' Jammed ');
    submit();
    const r = http.expectOne('/api/admin/support-tickets');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ associateId: 'a1', subject: 'Printer', description: 'Jammed' });
    r.flush(tk(), { status: 201, statusText: 'Created' });
    expect(logged).toHaveBeenCalled();
    expect(flash).toHaveBeenCalledWith({ key: 'admin.supportTickets.ok.logged', params: { subject: 'Printer', name: 'Jane', userId: 'VA-1' } });
  });

  it('double submit sends once', () => {
    fill(); submit(); submit();
    http.expectOne('/api/admin/support-tickets').flush(tk(), { status: 201, statusText: 'Created' });
  });

  it('404 shows the associate-not-found message under the lookup and keeps the form input', () => {
    fill(); submit();
    http.expectOne('/api/admin/support-tickets').flush({ error: 'Associate not found' }, { status: 404, statusText: 'NF' });
    fixture.detectChanges();
    expect(el().querySelector('.ticket-seal__lookup-error')!.textContent).toContain('admin.supportTickets.err.associateNotFound');
    expect(fixture.componentInstance.subject).toBe('Printer');
  });

  it('400 shows the server text; Cancel emits cancelLog', () => {
    fill(); submit();
    http.expectOne('/api/admin/support-tickets').flush({ error: 'subject must not be blank' }, { status: 400, statusText: 'Bad' });
    fixture.detectChanges();
    expect(el().textContent).toContain('subject must not be blank');
    const cancel = jasmine.createSpy('cancel'); fixture.componentInstance.cancelLog.subscribe(cancel);
    el().querySelector<HTMLButtonElement>('.ticket-seal__cancel')!.click();
    expect(cancel).toHaveBeenCalled();
  });

  it('keeps the submit button and the subject box focusable while busy', () => {
    fill();
    const subj = el().querySelector<HTMLInputElement>('input[name=subject]')!;
    subj.focus();
    submit(); fixture.detectChanges();
    const btn = el().querySelector<HTMLButtonElement>('.ticket-seal__submit')!;
    expect(btn.disabled).toBeFalse();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(subj.disabled).toBeFalse();
    expect(document.activeElement).toBe(subj);
    http.expectOne('/api/admin/support-tickets').flush({ error: 'x' }, { status: 500, statusText: 'err' });
  });

  it('Cancel is ignored while a log is in flight', () => {
    fill(); submit(); fixture.detectChanges();
    const cancel = jasmine.createSpy('cancel'); fixture.componentInstance.cancelLog.subscribe(cancel);
    el().querySelector<HTMLButtonElement>('.ticket-seal__cancel')!.click();
    expect(cancel).not.toHaveBeenCalled();
    http.expectOne('/api/admin/support-tickets').flush({ error: 'x' }, { status: 500, statusText: 'err' });
  });

  it('labels the associate lookup group', () => {
    const g = el().querySelector('[role=group]')!;
    expect(g.getAttribute('aria-labelledby')).toBeTruthy();
    expect(el().querySelector('#' + g.getAttribute('aria-labelledby'))).not.toBeNull();
  });

  it('re-entering log mode clears previous log input', () => {
    fill();
    fixture.componentRef.setInput('mode', 'respond'); fixture.detectChanges();
    fixture.componentRef.setInput('mode', 'log'); fixture.detectChanges();
    expect(fixture.componentInstance.subject).toBe('');
    expect(fixture.componentInstance.associateId).toBe('');
  });
});
