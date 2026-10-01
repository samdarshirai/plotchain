import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EPinsComponent } from './epins.component';

describe('EPinsComponent', () => {
  let fixture: ComponentFixture<EPinsComponent>;
  let httpMock: HttpTestingController;
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const pin = (over: Record<string, unknown> = {}) => ({
    id: 'p1', code: 'CODE-1', batchId: 'b', status: 'ALLOCATED', generatedBy: 'g', generatedAt: 'x', expiresAt: null,
    allocatedTo: 'me', allocatedBy: 'g', allocatedAt: 'x', redeemedTo: null, redeemedBy: null, redeemedAt: null,
    redemptionType: null, linkedEntityId: null, blockedBy: null, blockedAt: null, blockReason: null, expired: false, ...over
  });

  function flush(epins: unknown[]) {
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
    expect(c.actionPin).toBeNull();
    flush([]);
    expect(c.all.length).toBe(0);
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
    expect(c.actionPin).toBeNull();
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
    expect(c.actionPin).not.toBeNull();

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
    expect(c.actionPin?.id).toBe('p9');
  });

  it('ignores a superseded list response', () => {
    const c = fixture.componentInstance;
    const first = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    c.load();
    const second = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    second.flush({ epins: [pin({ code: 'NEW' })], page: 0, size: 100, totalElements: 1 });
    first.flush({ epins: [pin({ code: 'STALE' })], page: 0, size: 100, totalElements: 1 });
    expect(c.all.map(p => p.code)).toEqual(['NEW']);
  });
});
