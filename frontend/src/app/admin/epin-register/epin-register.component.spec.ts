import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterComponent } from './epin-register.component';

describe('EPinRegisterComponent', () => {
  let fixture: ComponentFixture<EPinRegisterComponent>;
  let httpMock: HttpTestingController;

  const pin = (over: Record<string, unknown> = {}) => ({
    id: 'p1', code: 'CODE-1', batchId: 'batch-0001-xxxx', status: 'ALLOCATED', generatedBy: 'g', generatedAt: '2026-10-01T00:00:00Z',
    expiresAt: null, allocatedTo: 'a1', allocatedBy: 'g', allocatedAt: '2026-10-01T00:00:00Z', redeemedTo: null, redeemedBy: null,
    redeemedAt: null, redemptionType: null, linkedEntityId: null, blockedBy: null, blockedAt: null, blockReason: null, expired: false,
    ...over
  });
  const associates = [{ id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];

  const UUID = '123e4567-e89b-12d3-a456-426614174000';
  const emptyPage = { epins: [], page: 0, size: 20, totalElements: 0 };
  const reload = () => httpMock.expectOne(r => r.url === '/api/admin/epins').flush(emptyPage);

  function flushInitial(epins: unknown[]) {
    httpMock.expectOne(r => r.url === '/api/associates').flush(associates);
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins, page: 0, size: 20, totalElements: epins.length });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EPinRegisterComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(EPinRegisterComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => httpMock.verify());

  it('renders a row per pin with the holder shown by userId', () => {
    flushInitial([pin()]);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('CODE-1');
    expect(text).toContain('VP00001');
  });

  it('shows the expired chip key and class for an expired pin', () => {
    flushInitial([pin({ expired: true })]);
    const chip = fixture.nativeElement.querySelector('.epin-register__chip--expired');
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('admin.epinRegister.expiredChip');
  });

  it('reloads page 0 with the status filter when it changes', () => {
    flushInitial([]);
    fixture.componentInstance.onStatusChange('BLOCKED');
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('status')).toBe('BLOCKED');
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('blocks a pin with the entered reason then reloads', () => {
    flushInitial([pin({ status: 'UNUSED', allocatedTo: null })]);
    const c = fixture.componentInstance;
    c.openPanel({ kind: 'block', epin: pin({ status: 'UNUSED' }) as never });
    c.panelReason = 'lost';
    c.submitBlock();
    const req = httpMock.expectOne('/api/admin/epins/p1/block');
    expect(req.request.body).toEqual({ reason: 'lost' });
    req.flush(pin({ status: 'BLOCKED' }));
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins: [], page: 0, size: 20, totalElements: 0 });
    expect(c.panel).toBeNull();
  });

  it('generates a batch and shows the returned codes once', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.generateCount = 2;
    c.submitGenerate();
    httpMock.expectOne('/api/admin/epins').flush({ batchId: UUID, count: 2, codes: ['X1', 'X2'], generatedAt: 'now', expiresAt: null });
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('X1');
    expect(fixture.nativeElement.textContent).toContain('X2');
    expect(fixture.nativeElement.textContent).toContain(UUID);
  });

  it('shows an inline error message when allocate fails with 409', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.allocateAssociateId = 'a1';
    c.allocateCount = 5;
    c.submitAllocate();
    httpMock.expectOne('/api/admin/epins/allocate').flush({ error: 'pool' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(c.actionError).toBe('admin.epinRegister.errorConflict');
  });

  it('shows the full batch id in the cell title', () => {
    flushInitial([pin({ batchId: UUID })]);
    const td = fixture.nativeElement.querySelector('tbody td[title]');
    expect(td.getAttribute('title')).toBe(UUID);
    expect(td.textContent.trim()).toBe(UUID.slice(0, 8));
  });

  it('does not request on a malformed batch id but does on a valid UUID', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.onBatchChange('123e45');
    httpMock.expectNone(r => r.url === '/api/admin/epins');
    c.onBatchChange(' ' + UUID + ' ');
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('batchId')).toBe(UUID);
    req.flush(emptyPage);
  });

  it('ignores a stale list response that arrives after a newer one', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.onStatusChange('USED');
    c.onStatusChange('BLOCKED');
    const reqs = httpMock.match(r => r.url === '/api/admin/epins');
    expect(reqs.length).toBe(2);
    reqs[1].flush({ epins: [pin({ id: 'new' })], page: 0, size: 20, totalElements: 1 });
    reqs[0].flush({ epins: [], page: 0, size: 20, totalElements: 0 });
    expect(c.page!.epins[0].id).toBe('new');
  });

  it('applies holder and expired-only filters', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.onHolderChange('a1');
    let req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('allocatedTo')).toBe('a1');
    req.flush(emptyPage);
    c.onExpiredChange(true);
    req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('expired')).toBe('true');
    expect(req.request.params.get('allocatedTo')).toBe('a1');
    req.flush(emptyPage);
  });

  it('guards generate count', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    for (const n of [0, -1, 2001, 1.5, null as unknown as number]) {
      c.actionError = '';
      c.generateCount = n;
      c.submitGenerate();
      expect(c.actionError).toBe('admin.epinRegister.errorInvalid');
    }
  });

  it('guards allocate associate, count and batch id', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    const cases: [string, number, string][] = [['', 1, ''], ['a1', 0, ''], ['a1', 2001, ''], ['a1', 1, 'not-a-uuid']];
    for (const [a, n, b] of cases) {
      c.actionError = '';
      c.allocateAssociateId = a; c.allocateCount = n; c.allocateBatchId = b;
      c.submitAllocate();
      expect(c.actionError).toBe('admin.epinRegister.errorInvalid');
    }
  });

  it('allocates with a valid batch id', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.allocateAssociateId = 'a1'; c.allocateCount = 2; c.allocateBatchId = UUID;
    c.submitAllocate();
    const req = httpMock.expectOne('/api/admin/epins/allocate');
    expect(req.request.body).toEqual({ associateId: 'a1', count: 2, batchId: UUID });
    req.flush({ associateId: 'a1', count: 2, pins: [] });
    reload();
  });

  it('guards redeem associate and block reason', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.openPanel({ kind: 'redeem', epin: pin() as never });
    c.submitRedeem();
    expect(c.actionError).toBe('admin.epinRegister.errorInvalid');
    c.openPanel({ kind: 'block', epin: pin() as never });
    c.panelReason = '   ';
    c.submitBlock();
    expect(c.actionError).toBe('admin.epinRegister.errorInvalid');
  });

  it('redeems then reloads', () => {
    flushInitial([pin()]);
    const c = fixture.componentInstance;
    c.openPanel({ kind: 'redeem', epin: pin() as never });
    c.redeemAssociateId = 'a1';
    c.redeemType = 'TOPUP';
    c.submitRedeem();
    const req = httpMock.expectOne('/api/admin/epins/p1/redeem');
    expect(req.request.body).toEqual({ associateId: 'a1', redemptionType: 'TOPUP' });
    req.flush(pin({ status: 'USED' }));
    reload();
    expect(c.panel).toBeNull();
  });

  it('unblocks then reloads', () => {
    flushInitial([pin({ status: 'BLOCKED' })]);
    fixture.componentInstance.unblock(pin({ status: 'BLOCKED' }) as never);
    const req = httpMock.expectOne('/api/admin/epins/p1/unblock');
    expect(req.request.method).toBe('POST');
    req.flush(pin());
    reload();
  });

  it('loads and renders translated events', () => {
    flushInitial([pin()]);
    fixture.componentInstance.openPanel({ kind: 'events', epin: pin() as never });
    httpMock.expectOne('/api/admin/epins/p1/events').flush([
      { eventType: 'GENERATED', actorId: 'g', fromAssociateId: null, toAssociateId: null, at: '2026-10-01T00:00:00Z', note: null }
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('admin.epinRegister.event.GENERATED');
  });

  it('renders the actor and from/to userIds in the events panel', () => {
    flushInitial([pin()]);
    const c = fixture.componentInstance;
    c.associates = [
      { id: 'act', userId: 'VPACTOR', name: 'A' }, { id: 'f1', userId: 'VPFROM', name: 'F' }, { id: 't1', userId: 'VPTO', name: 'T' }
    ] as never;
    c.openPanel({ kind: 'events', epin: pin() as never });
    httpMock.expectOne('/api/admin/epins/p1/events').flush([
      { eventType: 'TRANSFERRED', actorId: 'act', fromAssociateId: 'f1', toAssociateId: 't1', at: '2026-10-01T00:00:00Z', note: null }
    ]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('VPACTOR');
    expect(text).toContain('VPFROM');
    expect(text).toContain('VPTO');
  });

  it('resets redeem form state when a panel is reopened', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.openPanel({ kind: 'redeem', epin: pin() as never });
    c.redeemAssociateId = 'a1';
    c.openPanel({ kind: 'redeem', epin: pin({ id: 'p2' }) as never });
    expect(c.redeemAssociateId).toBe('');
    expect(c.redeemType).toBe('ACTIVATION');
  });
});
