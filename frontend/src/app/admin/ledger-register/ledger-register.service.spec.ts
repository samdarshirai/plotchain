import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LedgerRegisterService } from './ledger-register.service';
import { AdminLedgerPage } from '../models/admin-ledger-page.model';

describe('LedgerRegisterService', () => {
  let service: LedgerRegisterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LedgerRegisterService]
    });
    service = TestBed.inject(LedgerRegisterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists ledger entries with filters and pagination as query params', () => {
    const mockResponse: AdminLedgerPage = { entries: [], page: 0, size: 20, totalElements: 0 };

    service
      .list({ associateId: 'a1', incomeType: 'PERK', cycleId: 'c1', status: 'PAID' }, 0, 20)
      .subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/admin/ledger' &&
        r.params.get('associateId') === 'a1' &&
        r.params.get('incomeType') === 'PERK' &&
        r.params.get('cycleId') === 'c1' &&
        r.params.get('status') === 'PAID'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ incomeType: '', status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/ledger?page=0&size=20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });
});
