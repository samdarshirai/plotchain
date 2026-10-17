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
    createdAt: '2026-01-05T00:00:00Z',
    fulfilledAt: null,
    fulfilmentRemark: null
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

  it('renders income types as tabs and reloads when a tab is clicked', () => {
    const el: HTMLElement = fixture.nativeElement;
    const tabs = el.querySelectorAll<HTMLElement>('.ledger-register__tabs .tab-bar__tab');
    expect(tabs.length).toBe(8);
    expect(tabs[1].classList).toContain('tab-bar__tab--active');

    tabs[7].click();
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('incomeType') === 'PERK' && r.params.get('page') === '0');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(el.querySelectorAll('.ledger-register__tabs .tab-bar__tab')[7].classList).toContain('tab-bar__tab--active');
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

  it('has no action column and no row actions — this screen is view-only', () => {
    expect(fixture.componentInstance.registerColumns.some(c => c.type === 'action')).toBeFalse();
  });

  it('formats gross amount as currency with thousands separators, not a raw number', () => {
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('10,000');
    expect(rowText).not.toContain('10000');
  });

  it('renders CARRIED_FORWARD status with warning tone', () => {
    fixture.componentInstance.onStatusChange('CARRIED_FORWARD');
    httpMock.expectOne(r => r.params.get('status') === 'CARRIED_FORWARD').flush({
      entries: [{ ...sampleEntry, id: 'l3', status: 'CARRIED_FORWARD' }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('CARRIED_FORWARD');

    const badgeElement = fixture.nativeElement.querySelector('.editable-table tbody tr .editable-table__badge');
    expect(badgeElement?.classList.contains('editable-table__badge--warning')).toBeTrue();
  });

  it('SPONSOR_MATCHING tab mirrors the associate columns, prefixed with Associate ID and Name', () => {
    fixture.componentInstance.onIncomeTypeChange('SPONSOR_MATCHING');
    httpMock.expectOne(r => r.params.get('incomeType') === 'SPONSOR_MATCHING').flush({
      entries: [{ ...sampleEntry, id: 'l4', incomeType: 'SPONSOR_MATCHING', sponseeUserId: 'PC-0009', sponseeMatchingAmount: 500 }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const keys = fixture.componentInstance.registerColumns.map(c => c.key);
    expect(keys).toEqual(['associateId', 'name', 'date', 'memberId', 'matchingIncome', 'sponsorMatchingIncome', 'payStatus', 'paymentDate', 'remarks']);
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('PC-0001');
    expect(rowText).toContain('PC-0009');
  });

  it('selecting rows and saving posts one bulk mark-paid with the date and remark, then clears selection', () => {
    fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('tbody input[type=checkbox]');
    checkbox.click();
    expect(fixture.componentInstance.selectedIds).toEqual(['l1']);

    fixture.componentInstance.openFulfil(fixture.componentInstance.selectedIds);
    fixture.componentInstance.fulfilDate = '2026-07-01';
    fixture.componentInstance.fulfilRemark = 'NEFT';
    fixture.componentInstance.saveFulfil();

    const req = httpMock.expectOne('/api/admin/ledger/mark-paid');
    expect(req.request.body).toEqual({ ids: ['l1'], fulfilledAt: '2026-07-01T00:00:00.000Z', remark: 'NEFT' });
    req.flush(null);
    httpMock.expectOne(r => r.url === '/api/admin/ledger').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    expect(fixture.componentInstance.selectedIds).toEqual([]);
  });

  it('REWARD tab shows an Edit action that prefills and re-posts date and remark', () => {
    fixture.componentInstance.onIncomeTypeChange('REWARD');
    httpMock.expectOne(r => r.params.get('incomeType') === 'REWARD').flush({
      entries: [{ ...sampleEntry, id: 'r1', incomeType: 'REWARD', fulfilledAt: '2026-06-01T00:00:00Z', fulfilmentRemark: 'Car' }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.editable-table tbody button');
    expect(button).toBeTruthy();
    button.click();
    expect(fixture.componentInstance.fulfilDate).toBe('2026-06-01');
    expect(fixture.componentInstance.fulfilRemark).toBe('Car');
    fixture.componentInstance.fulfilDate = '2026-07-01';
    fixture.componentInstance.fulfilRemark = 'Cash chosen';
    fixture.componentInstance.saveFulfil();

    const req = httpMock.expectOne('/api/admin/ledger/mark-paid');
    expect(req.request.body.ids).toEqual(['r1']);
    expect(req.request.body.remark).toBe('Cash chosen');
    req.flush(null);
    httpMock.expectOne(r => r.url === '/api/admin/ledger').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('non-REWARD tabs have no per-row Edit action', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.editable-table tbody button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ledger-register__toolbar button').disabled).toBeTrue();
  });

  it('Summary tab shows one row per associate x cycle with per-type net, total and pay status', () => {
    fixture.componentInstance.onIncomeTypeChange('SUMMARY');
    httpMock.expectOne(r => r.url === '/api/admin/ledger/summary').flush({
      rows: [
        {
          associateId: 'a1', associateUserId: 'PC-0001', associateName: 'Jane Doe', cycleId: 'c1',
          cyclePeriodStart: '2026-01-01', cyclePeriodEnd: '2026-01-31',
          gross: { DIRECT: 1000, MATCHING: 2000 }, totalGross: 3000, tds: 150, adminCharges: 60, totalNet: 2790, entryCount: 3, paidCount: 1
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const keys = fixture.componentInstance.registerColumns.map(c => c.key);
    expect(keys.slice(0, 5)).toEqual(['associateId', 'name', 'cyclePeriod', 'DIRECT', 'MATCHING']);
    expect(keys.slice(-5)).toEqual(['totalGross', 'tds', 'adminCharges', 'totalNet', 'payStatus']);
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Jane Doe');
    expect(rowText).toContain('1,000');
    expect(rowText).toContain('3,000');
    expect(rowText).toContain('2,790');
    expect(rowText).toContain('admin.ledgerRegister.partlyPaid');
    expect(fixture.componentInstance.registerRows[0]['id']).toBe('a1|c1');
  });

  it('Summary mark paid posts associate/cycle pairs', () => {
    fixture.componentInstance.onIncomeTypeChange('SUMMARY');
    httpMock.expectOne(r => r.url === '/api/admin/ledger/summary').flush({ rows: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.openFulfil(['a1|c1', 'a2|c1']);
    fixture.componentInstance.fulfilDate = '2026-07-01';
    fixture.componentInstance.fulfilRemark = 'NEFT';
    fixture.componentInstance.saveFulfil();

    const req = httpMock.expectOne('/api/admin/ledger/summary/mark-paid');
    expect(req.request.body).toEqual({
      rows: [{ associateId: 'a1', cycleId: 'c1' }, { associateId: 'a2', cycleId: 'c1' }],
      fulfilledAt: '2026-07-01T00:00:00.000Z',
      remark: 'NEFT'
    });
    req.flush(null);
    httpMock.expectOne(r => r.url === '/api/admin/ledger/summary').flush({ rows: [], page: 0, size: 20, totalElements: 0 });
  });

  it('defaults the cycle filter to the most recent cycle', () => {
    const f = TestBed.createComponent(LedgerRegisterComponent);
    f.detectChanges();
    httpMock.expectOne(req => req.url === '/api/associates').flush([]);
    httpMock.expectOne(req => req.url === '/api/admin/cycles').flush({
      cycles: [
        { id: 'old', periodStart: '2026-01-01', periodEnd: '2026-01-15' },
        { id: 'new', periodStart: '2026-03-01', periodEnd: '2026-03-15' }
      ],
      page: 0, size: 100, totalElements: 2
    });
    httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('cycleId') === 'new')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    f.detectChanges();
    expect((f.nativeElement.querySelectorAll('select')[1] as HTMLSelectElement).value).toBe('new');
  });
});
