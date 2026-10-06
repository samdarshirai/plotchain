import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { AdminSupportTicketsComponent } from './admin-support-tickets.component';
import { TicketSealComponent } from './ticket-seal.component';

describe('AdminSupportTicketsComponent', () => {
  let fixture: ComponentFixture<AdminSupportTicketsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const tk = (id: string, over: Record<string, unknown> = {}) => ({
    id, associateId: 'a1', associateUserId: 'VA-1', associateName: 'Jane', subject: 'Subject ' + id,
    description: 'Desc ' + id, status: 'OPEN', response: null, respondedAt: null,
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', ...over
  });
  const pageOf = (entries: unknown[], total = entries.length, page = 0) => ({ entries, page, size: 20, totalElements: total });
  const directory = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];
  const listReq = () => http.expectOne(r => r.url === '/api/admin/support-tickets' && r.method === 'GET');

  function boot(entries: unknown[] = [tk('t1'), tk('t2')], total?: number) {
    http.expectOne('/api/associates').flush(directory);
    listReq().flush(pageOf(entries, total));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSupportTicketsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminSupportTicketsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a row per ticket with subject, snippet, associate and status chip', () => {
    boot();
    const rows = el().querySelectorAll('tbody tr.support-tickets__row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Subject t1');
    expect(rows[0].textContent).toContain('Desc t1');
    expect(rows[0].textContent).toContain('Jane');
    expect(rows[0].textContent).toContain('VA-1');
    expect(rows[0].querySelector('.support-tickets__chip--open')).not.toBeNull();
  });

  it('first load is unfiltered: no status or associateId param, page 0', () => {
    http.expectOne('/api/associates').flush(directory);
    const r = listReq();
    expect(r.request.params.has('status')).toBeFalse();
    expect(r.request.params.has('associateId')).toBeFalse();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('changing a filter reloads page 0 with it', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'RESOLVED' });
    const r = listReq();
    expect(r.request.params.get('status')).toBe('RESOLVED');
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('shows the first-run empty state without filters and the no-match state with filters', () => {
    boot([]);
    expect(el().querySelector('.support-tickets__empty')!.textContent).toContain('admin.supportTickets.empty.noTicketsTitle');
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    listReq().flush(pageOf([]));
    fixture.detectChanges();
    expect(el().querySelector('.support-tickets__empty')!.textContent).toContain('admin.supportTickets.empty.noMatchTitle');
  });

  it('shows a skeleton while loading and a retry banner on load failure that re-requests', () => {
    http.expectOne('/api/associates').flush(directory);
    expect(el().querySelector('.support-tickets__skeleton')).not.toBeNull();
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.supportTickets.err.load');
    el().querySelector<HTMLButtonElement>('.support-tickets__retry')!.click();
    listReq().flush(pageOf([tk('t1')]));
  });

  it('pages: next requests page 1', () => {
    boot([tk('t1')], 45);
    el().querySelector<HTMLButtonElement>('.support-tickets__next')!.click();
    const r = listReq();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([tk('t9')], 45, 1));
  });

  it('a stale slow response never overwrites a newer one', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'OPEN' });
    const slow = listReq();
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    const fast = listReq();
    fast.flush(pageOf([tk('closed1', { status: 'CLOSED' })]));
    slow.flush(pageOf([tk('open1')]));
    expect(fixture.componentInstance.page!.entries[0].id).toBe('closed1');
  });

  it('selecting a row opens the respond seal', () => {
    boot();
    el().querySelectorAll<HTMLElement>('tbody tr.support-tickets__row')[1].click();
    expect(fixture.componentInstance.selected!.id).toBe('t2');
    expect(fixture.componentInstance.sealMode).toBe('respond');
  });

  it('a saved ticket patches its row, keeps selection, and flags a filter mismatch when it left the status filter', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'OPEN' });
    listReq().flush(pageOf([tk('t1'), tk('t2')]));
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]);
    fixture.componentInstance.onSaved(tk('t1', { status: 'RESOLVED', response: 'Done' }) as never);
    expect(fixture.componentInstance.page!.entries[0].status).toBe('RESOLVED');
    expect(fixture.componentInstance.selected!.id).toBe('t1');
    listReq().flush(pageOf([tk('t2')])); // resync (status=OPEN) no longer contains t1
    expect(fixture.componentInstance.filterMismatch).toBeTrue();
    expect(fixture.componentInstance.selected!.id).toBe('t1');
  });

  it('resetting filters while the selected ticket sits on a later page does not claim a filter mismatch', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    listReq().flush(pageOf([tk('t3', { status: 'CLOSED' })]));
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]);
    fixture.componentInstance.applyFilter({ status: 'OPEN' });
    listReq().flush(pageOf([tk('t1')]));
    expect(fixture.componentInstance.filterMismatch).toBeTrue();
    fixture.componentInstance.resetFilters();
    listReq().flush(pageOf([tk('t1')], 45)); // t3 exists, just on another page
    expect(fixture.componentInstance.filterMismatch).toBeFalse();
    expect(fixture.componentInstance.selected!.id).toBe('t3');
  });

  it('locks filters, pager and selection while a write is in flight', () => {
    boot();
    fixture.componentInstance.locked = true;
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]);
    expect(fixture.componentInstance.filters.status).toBe('');
    expect(fixture.componentInstance.selected).toBeNull();
  });

  it('Log a ticket switches the seal to log mode; cancel returns to respond', () => {
    boot();
    el().querySelector<HTMLButtonElement>('.support-tickets__log')!.click();
    expect(fixture.componentInstance.sealMode).toBe('log');
    fixture.componentInstance.onCancelLog();
    expect(fixture.componentInstance.sealMode).toBe('respond');
  });

  it('logging a ticket selects it, reloads page 0 and shows the success banner', () => {
    boot();
    el().querySelector<HTMLButtonElement>('.support-tickets__log')!.click(); fixture.detectChanges();
    const seal = fixture.debugElement.query(By.directive(TicketSealComponent)).componentInstance as TicketSealComponent;
    seal.associateId = 'a1'; seal.subject = 'New'; seal.description = 'Body';
    seal.submitLog();
    http.expectOne(r => r.method === 'POST' && r.url === '/api/admin/support-tickets').flush(tk('t9', { subject: 'New' }), { status: 201, statusText: 'Created' });
    listReq().flush(pageOf([tk('t9', { subject: 'New' }), tk('t1')]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('t9');
    expect(fixture.componentInstance.sealMode).toBe('respond');
    expect(el().textContent).toContain('admin.supportTickets.ok.logged');
  });

  it('a logged ticket that the active filters hide stays selected with the mismatch note', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'CLOSED' });
    listReq().flush(pageOf([]));
    fixture.componentInstance.onLogged(tk('t9') as never);
    listReq().flush(pageOf([]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('t9');
    expect(fixture.componentInstance.filterMismatch).toBeTrue();
  });

  it('responding keeps the selection and shows the success banner', () => {
    boot();
    fixture.componentInstance.selectTicket(fixture.componentInstance.page!.entries[0]); fixture.detectChanges();
    const seal = fixture.debugElement.query(By.directive(TicketSealComponent)).componentInstance as TicketSealComponent;
    seal.status = 'RESOLVED'; seal.reply = 'Done';
    seal.submitRespond();
    http.expectOne('/api/admin/support-tickets/t1/respond').flush(tk('t1', { status: 'RESOLVED', response: 'Done' }));
    listReq().flush(pageOf([tk('t1', { status: 'RESOLVED', response: 'Done' }), tk('t2')]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.status).toBe('RESOLVED');
    expect(el().textContent).toContain('admin.supportTickets.ok.responded');
  });
});
