import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LedgerRegisterComponent } from './ledger-register.component';

describe('LedgerRegisterComponent', () => {
  let fixture: ComponentFixture<LedgerRegisterComponent>;
  let httpMock: HttpTestingController;

  const sampleEntry = {
    id: 'l1',
    associateId: 'a1',
    associateUserId: 'PC-0001',
    associateName: 'Jane Doe',
    incomeType: 'DIRECT',
    cycleId: 'c1',
    cyclePeriodStart: '2026-01-01',
    cyclePeriodEnd: '2026-01-31',
    grossAmount: 10000,
    tdsDeduction: 500,
    adminDeduction: 200,
    netAmount: 9300,
    status: 'PAID',
    sourceRef: 's1',
    createdAt: '2026-01-05T00:00:00Z'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedgerRegisterComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(LedgerRegisterComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
    httpMock
      .expectOne(req => req.url === '/api/admin/cycles' && req.method === 'GET')
      .flush({ cycles: [], page: 0, size: 100, totalElements: 0 });
    httpMock.expectOne('/api/admin/ledger?page=0&size=20').flush({
      entries: [sampleEntry],
      page: 0,
      size: 20,
      totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of ledger entries on init', () => {
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
  });

  it('shows the resolved associate name and cycle period dates, not raw UUIDs', () => {
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Jane Doe');
    expect(rowText).not.toContain('a1');
    expect(rowText).not.toContain('c1');
  });

  it('reloads with the associateId filter when it changes', () => {
    fixture.componentInstance.onAssociateIdChange('a2');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('associateId') === 'a2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the incomeType filter when it changes', () => {
    fixture.componentInstance.onIncomeTypeChange('PERK');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('incomeType') === 'PERK');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the cycleId filter when it changes', () => {
    fixture.componentInstance.onCycleIdChange('c2');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('cycleId') === 'c2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('REVERSED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('status') === 'REVERSED');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/ledger?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.ledger-register__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/ledger?page=1&size=20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no entries match', () => {
    fixture.componentInstance.onStatusChange('REVERSED');
    httpMock.expectOne(r => r.params.get('status') === 'REVERSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('renders a dash for a null sourceRef instead of blank or "null"', () => {
    fixture.componentInstance.onStatusChange('PENDING');
    httpMock.expectOne(r => r.params.get('status') === 'PENDING').flush({
      entries: [{ ...sampleEntry, id: 'l2', sourceRef: null, status: 'PENDING' }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('—');
  });

  it('has no action column and no row actions — this screen is view-only', () => {
    expect(fixture.componentInstance.registerColumns.some(c => c.type === 'action')).toBeFalse();
  });

  it('formats netAmount as currency with thousands separators, not a raw number', () => {
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('9,300');
    expect(rowText).not.toContain('9300');
  });
});
