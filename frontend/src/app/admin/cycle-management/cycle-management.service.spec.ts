import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CycleManagementService } from './cycle-management.service';
import { CyclePage } from '../models/cycle.model';
import { CycleDetail } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';

describe('CycleManagementService', () => {
  let service: CycleManagementService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CycleManagementService]
    });
    service = TestBed.inject(CycleManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists cycles with pagination as query params, no status param when unset', () => {
    const mockResponse: CyclePage = { cycles: [], page: 0, size: 20, totalElements: 0 };

    service.list('', 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/admin/cycles?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('lists cycles with a status filter param when set', () => {
    service.list('OPEN', 0, 20).subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/admin/cycles' && r.params.get('status') === 'OPEN');
    req.flush({ cycles: [], page: 0, size: 20, totalElements: 0 });
  });

  it('fetches a cycle detail by id', () => {
    const mockDetail: CycleDetail = {
      id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED',
      incomeTypeTotals: [{ incomeType: 'DIRECT', totalNet: 100 }], totalNet: 100
    };

    service.detail('c1').subscribe(res => expect(res).toEqual(mockDetail));

    const req = httpMock.expectOne('/api/admin/cycles/c1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDetail);
  });

  it('closes a cycle by id', () => {
    const mockResponse: CycleCloseResponse = { cycleId: 'c1', status: 'CLOSED', legVolumeRowsWritten: 3, newCycleId: 'c2' };

    service.close('c1').subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/admin/cycles/c1/close');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });
});
