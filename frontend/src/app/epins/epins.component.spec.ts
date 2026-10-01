import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EPinsComponent } from './epins.component';

describe('EPinsComponent', () => {
  let fixture: ComponentFixture<EPinsComponent>;
  let httpMock: HttpTestingController;
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const pin = (over: Record<string, unknown> = {}) => ({
    id: 'p1', code: 'CODE-1', batchId: 'b', status: 'ALLOCATED', generatedBy: 'g', generatedAt: '2026-10-01T00:00:00Z', expiresAt: null,
    allocatedTo: 'me', allocatedBy: 'g', allocatedAt: '2026-10-01T00:00:00Z', redeemedTo: null, redeemedBy: null, redeemedAt: null,
    redemptionType: null, linkedEntityId: null, blockedBy: null, blockedAt: null, blockReason: null, expired: false, ...over
  });

  function flush(epins: unknown[]) {
    httpMock.match('/api/associates/me/profile').forEach(r => r.flush({ id: 'me' }));
    httpMock.expectOne(r => r.url === '/api/associates/me/epins').flush(
      { epins, page: 0, size: 100, totalElements: epins.length });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EPinsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(EPinsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => httpMock.verify());

  it('lists available pins (ALLOCATED, not expired) with activate and transfer actions', () => {
    flush([pin(), pin({ id: 'p2', code: 'OLD', expired: true }), pin({ id: 'p3', code: 'DONE', status: 'USED' })]);
    const c = fixture.componentInstance;
    expect(c.available.map(p => p.code)).toEqual(['CODE-1']);
    expect(c.history.map(p => p.code).sort()).toEqual(['DONE', 'OLD']);
    expect(fixture.nativeElement.querySelectorAll('.epins__available-row').length).toBe(1);
  });

  it('summarises available, used and expiring-within-7-days counts', () => {
    flush([pin(), pin({ id: 'p2', expiresAt: soon }), pin({ id: 'p3', status: 'USED' })]);
    const c = fixture.componentInstance;
    expect(c.availableCount).toBe(2);
    expect(c.usedCount).toBe(1);
    expect(c.expiringSoonCount).toBe(1);
  });

  it('activates a member by userId then reloads', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'activate');
    c.userIdInput = ' VP00042 ';
    c.confirmAction();
    const req = httpMock.expectOne('/api/associates/me/epins/p1/redeem');
    expect(req.request.body).toEqual({ userId: 'VP00042' });
    req.flush(pin({ status: 'USED' }));
    expect(c.userIdInput).toBe('');
    flush([]);
    expect(c.all.length).toBe(0);
    expect(c.selectedPin).toBeNull();
  });

  it('transfers by userId then closes the panel and reloads', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'transfer');
    c.userIdInput = 'VP00050';
    c.confirmAction();
    const req = httpMock.expectOne('/api/associates/me/epins/p1/transfer');
    expect(req.request.body).toEqual({ toUserId: 'VP00050' });
    req.flush(pin({ allocatedTo: 'other' }));
    expect(c.userIdInput).toBe('');
    flush([]);
  });

  it('shows an inline message on 404 / 409 and keeps the panel open', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'transfer');
    c.userIdInput = 'VP00050';
    c.confirmAction();
    httpMock.expectOne('/api/associates/me/epins/p1/transfer')
      .flush({ error: 'x' }, { status: 404, statusText: 'Not Found' });
    expect(c.actionError).toBe('epins.errorNotFound');
    expect(c.selectedPin).not.toBeNull();

    c.confirmAction();
    httpMock.expectOne('/api/associates/me/epins/p1/transfer')
      .flush({ error: 'x' }, { status: 409, statusText: 'Conflict' });
    expect(c.actionError).toBe('epins.errorConflict');
  });

  it('does not submit with a blank userId', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'activate');
    c.userIdInput = '   ';
    c.confirmAction();
    httpMock.expectNone(r => r.url.includes('/redeem'));
    expect(c.actionError).toBe('epins.errorUserIdRequired');
  });

  it('startAction clears a previous userId and error', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.startAction(pin() as never, 'activate');
    c.userIdInput = 'VP1';
    c.actionError = 'epins.errorConflict';
    c.startAction(pin({ id: 'p9' }) as never, 'transfer');
    expect(c.userIdInput).toBe('');
    expect(c.actionError).toBe('');
    expect(c.selectedPin?.id).toBe('p1'); // p9 is not in the loaded list, falls back to first available
  });

  it('ignores a superseded list response', () => {
    const c = fixture.componentInstance;
    const first = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    c.load();
    const second = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    httpMock.expectOne('/api/associates/me/profile').flush({ id: 'me' });
    second.flush({ epins: [pin({ code: 'NEW' })], page: 0, size: 100, totalElements: 1 });
    first.flush({ epins: [pin({ code: 'STALE' })], page: 0, size: 100, totalElements: 1 });
    expect(c.all.map(p => p.code)).toEqual(['NEW']);
  });

  it('lists a transferred-out pin in History as Transferred with no action buttons', () => {
    flush([pin({ id: 'p7', code: 'GONE', allocatedTo: 'someone-else' })]);
    const c = fixture.componentInstance;
    expect(c.available.length).toBe(0);
    expect(c.history.map(p => p.code)).toEqual(['GONE']);
    expect(c.historyLabel(c.history[0])).toBe('epins.statusTransferred');
    expect(fixture.nativeElement.querySelectorAll('.epins__available-row').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('epins.statusTransferred');
    expect(fixture.nativeElement.querySelector('.epins__detail')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('button[type=button]').length).toBe(0);
  });

  it('treats nothing as available until the caller id is known', () => {
    const c = fixture.componentInstance;
    httpMock.expectOne(r => r.url === '/api/associates/me/epins').flush(
      { epins: [pin()], page: 0, size: 100, totalElements: 1 });
    expect(c.available.length).toBe(0);
    httpMock.expectOne('/api/associates/me/profile').flush({ id: 'me' });
    expect(c.available.map(p => p.code)).toEqual(['CODE-1']);
  });

  it('selects the first available pin by default and switches on click', () => {
    flush([pin({ id: 'p1', code: 'A' }), pin({ id: 'p2', code: 'B' })]);
    const c = fixture.componentInstance;
    expect(c.selectedPin?.id).toBe('p1');
    const rows = fixture.nativeElement.querySelectorAll('.epins__available-row');
    rows[1].click();
    fixture.detectChanges();
    expect(c.selectedPin?.id).toBe('p2');
    expect(fixture.nativeElement.querySelector('.epins__seal-code').textContent).toContain('B');
  });

  it('switching action via the segment resets the form and posts to the matching endpoint', () => {
    flush([pin()]);
    const c = fixture.componentInstance;
    c.userIdInput = 'VP1';
    const tabs = fixture.nativeElement.querySelectorAll('.epins__segment-btn');
    tabs[1].click();
    fixture.detectChanges();
    expect(c.action).toBe('transfer');
    expect(c.userIdInput).toBe('');
    c.userIdInput = 'VP2';
    c.confirmAction();
    httpMock.expectOne('/api/associates/me/epins/p1/transfer').flush(pin({ allocatedTo: 'other' }));
    flush([]);
  });

  it('shows the empty state and no detail panel with no available pins', () => {
    flush([]);
    expect(fixture.nativeElement.querySelector('.epins__detail')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('epins.emptyAvailable');
  });

  it('copy shows a check for the copied code then resets', () => {
    jasmine.clock().install();
    try {
      flush([pin()]);
      const c = fixture.componentInstance;
      c.copy('CODE-1');
      expect(c.copied).toBe('CODE-1');
      jasmine.clock().tick(1500);
      expect(c.copied).toBeNull();
    } finally { jasmine.clock().uninstall(); }
  });
});
