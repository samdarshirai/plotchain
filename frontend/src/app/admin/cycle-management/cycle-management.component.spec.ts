import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleManagementComponent } from './cycle-management.component';

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
});
