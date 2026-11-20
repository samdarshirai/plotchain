import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SalesRegisterService } from './sales-register.service';
import { SalesRegisterComponent } from './sales-register.component';

describe('SalesRegisterComponent', () => {
  let fixture: ComponentFixture<SalesRegisterComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // RouterTestingModule is required because the template uses [routerLink] (the "+ Record
    // Sale" link) -- omitting it makes TestBed.createComponent throw NG02801 (no Router provider).
    await TestBed.configureTestingModule({
      imports: [SalesRegisterComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesRegisterComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === '/api/admin/cycles').flush({ cycles: [{ id: 'c1', periodStart: '2026-01-01', periodEnd: null }], page: 0, size: 100, totalElements: 1 });
    httpMock.expectOne('/api/admin/sales?page=0&size=100').flush({
      sales: [
        {
          id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
          buyerEmail: null, amount: 100000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
          voidReason: null, recordedAt: '2026-01-01T00:00:00Z', plotNo: 'A1', projectName: 'Green Meadows',
          associateUserId: 'VP00009', associateName: 'Jane', sponsorUserId: 'VP00001', sponsorName: 'Jane Associate', note: 'Sold to Jane',
          buyerAssociateUserId: 'VP00009', buyerPlacementUserId: 'VP00005'
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of sales on init', () => {
    expect(fixture.componentInstance.page?.sales.length).toBe(1);
  });

  it('shows Sponsor ID, Buyer Associate ID and Buyer name columns', () => {
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('VP00001');
    expect(rowText).toContain('VP00009');
    expect(rowText).toContain('Jane');
  });

  it('shows Plot No, Sponsor Name and Placement ID columns', () => {
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('A1');
    expect(rowText).toContain('Jane Associate');
    expect(rowText).toContain('VP00005');
  });

  it('reloads with cycleId when the cycle filter changes', () => {
    fixture.componentInstance.onCycleChange('c1');
    httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('cycleId') === 'c1')
      .flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with plotNo when the plot no filter changes', () => {
    fixture.componentInstance.onPlotNoInput(' A1 ');
    httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('plotNo') === 'A1')
      .flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('formats the amount column as currency with thousands separators, not a raw number', () => {
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('100,000');
    expect(rowText).not.toContain('100000');
  });

  it('renders the projectName column and no note column', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.registerColumns.some(c => c.key === 'projectName')).toBeTrue();
    expect(fixture.componentInstance.registerColumns.some(c => c.key === 'note')).toBeFalse();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Green Meadows');
  });

  it('reloads with the search text when it changes', () => {
    fixture.componentInstance.onSearchInput('jane');

    const req = httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('search') === 'jane');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('VOIDED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('status') === 'VOIDED');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with recordedFrom/recordedTo when the date filters change', () => {
    fixture.componentInstance.onRecordedFromChange('2026-01-01');
    httpMock.expectOne(r => r.params.get('recordedFrom') === '2026-01-01').flush({ sales: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onRecordedToChange('2026-01-31');
    httpMock.expectOne(r => r.params.get('recordedTo') === '2026-01-31').flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows an empty-state row when no sales match', () => {
    fixture.componentInstance.onStatusChange('VOIDED');
    httpMock.expectOne(r => r.params.get('status') === 'VOIDED').flush({ sales: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('has a Plot No column and no actions column or void controls, even for a VOIDED row', () => {
    fixture.detectChanges();
    const keys = fixture.componentInstance.registerColumns.map(c => c.key);
    expect(keys).toContain('plotNo');
    expect(keys).not.toContain('actions');

    fixture.componentInstance.onStatusChange('VOIDED');
    httpMock.expectOne(r => r.params.get('status') === 'VOIDED').flush({
      sales: [{
        id: 's2', plotId: 'p2', associateId: 'a1', buyerName: 'Ravi', buyerPhone: '8888888888',
        buyerEmail: null, amount: 50000, cycleId: 'c1', legCredited: 'R', status: 'VOIDED',
        voidReason: 'Buyer cancelled', recordedAt: '2026-01-02T00:00:00Z'
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.editable-table input, .editable-table button')).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('Voided');
  });

  it('uses the associate endpoints (from/to params) when route scope is me', () => {
    const svc = TestBed.inject(SalesRegisterService);
    svc.list({ recordedFrom: '2026-01-01', recordedTo: '2026-01-31', plotNo: 'A1' }, 0, 100, true).subscribe();
    httpMock.expectOne('/api/associates/me/sales?page=0&size=100&from=2026-01-01&to=2026-01-31&plotNo=A1').flush({ sales: [], page: 0, size: 100, totalElements: 0 });
  });
});
