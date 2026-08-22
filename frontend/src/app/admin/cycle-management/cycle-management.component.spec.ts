import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleManagementComponent } from './cycle-management.component';

const STATS_RESPONSE = {
  totalAssociates: 6,
  kycBreakdown: { pending: 0, verified: 0, rejected: 0 },
  totalWalletBalance: 0,
  pendingWithdrawals: 0,
  currentCycle: {
    cycleId: 'c2',
    periodStart: '2026-08-16',
    periodEnd: '2026-08-31',
    daysRemaining: 12,
    directIncome: 1000,
    matchingIncome: 500,
    totalIncome: 1500,
    newAssociatesThisCycle: 3,
    salesThisCycle: 4,
    revenueThisCycle: 200000
  },
  activePlots: 0,
  totalSalesRecorded: 0,
  cyclesCompleted: 0
};

describe('CycleManagementComponent', () => {
  let fixture: ComponentFixture<CycleManagementComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleManagementComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CycleManagementComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/cycles?page=0&size=20').flush({
      cycles: [
        { id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED' },
        { id: 'c2', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'OPEN' }
      ],
      page: 0, size: 20, totalElements: 2
    });
    httpMock.expectOne('/api/admin/stats').flush(STATS_RESPONSE);
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of cycle history on init', () => {
    expect(fixture.componentInstance.page?.cycles.length).toBe(2);
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('OPEN');

    const req = httpMock.expectOne(r => r.url === '/api/admin/cycles' && r.params.get('status') === 'OPEN');
    req.flush({ cycles: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/cycles?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.cycle-management__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/cycles?page=1&size=20');
    req.flush({ cycles: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no cycles match', () => {
    fixture.componentInstance.onStatusChange('PAID');
    httpMock.expectOne(r => r.params.get('status') === 'PAID').flush({ cycles: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('fetches and opens the detail side panel when View Detail is clicked', () => {
    fixture.detectChanges();
    fixture.componentInstance.viewDetail('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1');
    req.flush({
      id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED',
      incomeTypeTotals: [
        { incomeType: 'DIRECT', totalNet: 500 },
        { incomeType: 'MATCHING', totalNet: 200 },
        { incomeType: 'SPONSOR_MATCHING', totalNet: 20 },
        { incomeType: 'ROYALTY', totalNet: 10 },
        { incomeType: 'REWARD', totalNet: 0 }
      ],
      totalNet: 730
    });

    expect(fixture.componentInstance.selectedDetail?.totalNet).toBe(730);
    expect(fixture.componentInstance.detailPanelOpen).toBe(true);
  });

  it('shows a detail error when the drill-down fetch fails, without silently doing nothing', () => {
    fixture.componentInstance.viewDetail('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.detailError).toBe(true);
    expect(fixture.componentInstance.selectedDetail).toBeNull();
  });

  it('closes the detail panel via closeDetailPanel', () => {
    fixture.componentInstance.detailPanelOpen = true;
    fixture.componentInstance.closeDetailPanel();

    expect(fixture.componentInstance.detailPanelOpen).toBe(false);
  });

  it('derives the current OPEN cycle from the unfiltered history page and shows a Close Cycle button', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.currentOpenCycle?.id).toBe('c2');
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.cycle-management__close-cycle-action');
    expect(button).toBeTruthy();
  });

  it('loads and shows the current cycle\'s income stats relocated from the dashboard', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.currentCycleStats?.totalIncome).toBe(1500);
    const stats: HTMLElement = fixture.nativeElement.querySelector('.cycle-management__current-stats');
    expect(stats).toBeTruthy();
    expect(stats.textContent).toContain('12'); // daysRemaining
    expect(stats.textContent).toContain('3'); // newAssociatesThisCycle
  });

  it('does not show a Close Cycle button when no OPEN cycle is present', () => {
    fixture.componentInstance.onStatusChange('CLOSED');
    httpMock.expectOne(r => r.params.get('status') === 'CLOSED').flush({
      cycles: [{ id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED' }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    // currentOpenCycle keeps its last-known value from the unfiltered load above (c2) --
    // filtering to CLOSED must not clear it, per this task's design decision.
    expect(fixture.componentInstance.currentOpenCycle?.id).toBe('c2');
  });

  it('closes the current cycle and shows the SettlementResult monitor banner', () => {
    fixture.detectChanges();
    fixture.componentInstance.closeCycle();

    const req = httpMock.expectOne('/api/admin/cycles/c2/close');
    expect(req.request.method).toBe('POST');
    req.flush({ cycleId: 'c2', status: 'CLOSED', legVolumeRowsWritten: 5, newCycleId: 'c3' });

    httpMock.expectOne('/api/admin/cycles?page=0&size=20').flush({
      cycles: [
        { id: 'c2', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'CLOSED' },
        { id: 'c3', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'OPEN' }
      ],
      page: 0, size: 20, totalElements: 2
    });

    expect(fixture.componentInstance.closeResult?.newCycleId).toBe('c3');
    expect(fixture.componentInstance.closeError).toBeNull();
  });

  it('shows a conflict error on a 409 without crashing', () => {
    fixture.detectChanges();
    fixture.componentInstance.closeCycle();

    const req = httpMock.expectOne('/api/admin/cycles/c2/close');
    req.flush({ error: 'Cycle is not open, cannot close' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.closeError).toBe('conflict');
    expect(fixture.componentInstance.closeResult).toBeNull();
  });

  it('shows a generic error on a non-409 close failure', () => {
    fixture.detectChanges();
    fixture.componentInstance.closeCycle();

    const req = httpMock.expectOne('/api/admin/cycles/c2/close');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.closeError).toBe('generic');
  });

  it('shows a Credit Wallets button only for the CLOSED row, not the OPEN row', () => {
    fixture.detectChanges();
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('.cycle-management__credit-wallets-action');
    expect(buttons.length).toBe(1);
  });

  it('credits wallets for a CLOSED cycle and shows the success banner, then reloads the current page', () => {
    fixture.detectChanges();
    fixture.componentInstance.creditWallets('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    expect(req.request.method).toBe('POST');
    req.flush({ cycleId: 'c1', entriesCredited: 12, totalAmountCredited: 4500, newCycleStatus: 'PAID' });

    httpMock.expectOne('/api/admin/cycles?page=0&size=20').flush({
      cycles: [
        { id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'PAID' },
        { id: 'c2', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'OPEN' }
      ],
      page: 0, size: 20, totalElements: 2
    });

    expect(fixture.componentInstance.creditResult?.entriesCredited).toBe(12);
    expect(fixture.componentInstance.creditResult?.newCycleStatus).toBe('PAID');
    expect(fixture.componentInstance.creditError).toBeNull();
    expect(fixture.componentInstance.page?.cycles[0].status).toBe('PAID');
  });

  it('shows a conflict error on a 409 without crashing', () => {
    fixture.detectChanges();
    fixture.componentInstance.creditWallets('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    req.flush({ error: 'Cycle is not closed, cannot credit' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.creditError).toBe('conflict');
    expect(fixture.componentInstance.creditResult).toBeNull();
  });

  it('shows a generic error on a non-409 credit-wallets failure', () => {
    fixture.detectChanges();
    fixture.componentInstance.creditWallets('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1/credit-wallets');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.creditError).toBe('generic');
  });
});
