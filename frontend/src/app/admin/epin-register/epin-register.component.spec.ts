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

  it('shows an Expired chip for an expired pin and disables nothing else', () => {
    flushInitial([pin({ expired: true })]);
    expect(fixture.nativeElement.querySelector('.epin-register__chip--expired')).not.toBeNull();
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
  });

  it('generates a batch and shows the returned codes once', () => {
    flushInitial([]);
    const c = fixture.componentInstance;
    c.generateCount = 2;
    c.submitGenerate();
    httpMock.expectOne('/api/admin/epins').flush({ batchId: 'b', count: 2, codes: ['X1', 'X2'], generatedAt: 'now', expiresAt: null });
    httpMock.expectOne(r => r.url === '/api/admin/epins').flush({ epins: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('X1');
    expect(fixture.nativeElement.textContent).toContain('X2');
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
});
