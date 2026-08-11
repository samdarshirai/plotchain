import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
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

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
    httpMock.expectOne('/api/admin/sales?page=0&size=20').flush({
      sales: [
        {
          id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
          buyerEmail: null, amount: 100000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
          voidReason: null, recordedAt: '2026-01-01T00:00:00Z'
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of sales on init', () => {
    expect(fixture.componentInstance.page?.sales.length).toBe(1);
  });

  it('reloads with the associateId filter when it changes', () => {
    fixture.componentInstance.onAssociateIdChange('a2');

    const req = httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('associateId') === 'a2');
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

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/sales?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.sales-register__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/sales?page=1&size=20');
    req.flush({ sales: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no sales match', () => {
    fixture.componentInstance.onStatusChange('VOIDED');
    httpMock.expectOne(r => r.params.get('status') === 'VOIDED').flush({ sales: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });
});
