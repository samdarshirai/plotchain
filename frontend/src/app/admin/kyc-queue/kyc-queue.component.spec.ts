import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { KycQueueComponent } from './kyc-queue.component';

describe('KycQueueComponent', () => {
  let fixture: ComponentFixture<KycQueueComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycQueueComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(KycQueueComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [{ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'PENDING', joinedAt: '2026-01-01T00:00:00Z' }], page: 0, size: 20, totalElements: 1 });
  });

  afterEach(() => httpMock.verify());

  it('loads the pending queue by default', () => {
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
    expect(fixture.componentInstance.activeStatus).toBe('PENDING');
  });

  it('reloads the queue when the status tab changes', () => {
    fixture.componentInstance.onTabChange('REJECTED');

    const req = httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.activeStatus).toBe('REJECTED');
  });

  it('shows a load error when the tab-change reload fails, without silently doing nothing', () => {
    fixture.componentInstance.onTabChange('REJECTED');

    const req = httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('approves an entry and removes it from the pending list', () => {
    fixture.componentInstance.approve('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'VERIFIED', reason: undefined });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'VERIFIED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('rejects an entry with a reason', () => {
    fixture.componentInstance.rejectReasons['a1'] = 'Blurry PAN photo';
    fixture.componentInstance.reject('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('keeps each row\'s reject reason independent, so rejecting one leaves the other untouched', () => {
    fixture.componentInstance.rejectReasons['a1'] = 'Blurry PAN photo';
    fixture.componentInstance.rejectReasons['a2'] = 'Name mismatch';

    fixture.componentInstance.reject('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.rejectReasons['a1']).toBeUndefined();
    expect(fixture.componentInstance.rejectReasons['a2']).toBe('Name mismatch');
  });

  it('shows a decision error when approve fails, without silently doing nothing', () => {
    fixture.componentInstance.approve('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.decisionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__decision-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows a decision error when reject fails, without silently doing nothing', () => {
    fixture.componentInstance.rejectReasons['a1'] = 'Blurry PAN photo';
    fixture.componentInstance.reject('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.decisionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__decision-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clears a stale decision error once a subsequent list load succeeds', () => {
    fixture.componentInstance.approve('a1');
    httpMock.expectOne('/api/admin/kyc/a1/decision').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(fixture.componentInstance.decisionError).toBe(true);

    fixture.componentInstance.onTabChange('REJECTED');
    httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.decisionError).toBe(false);
  });
});
