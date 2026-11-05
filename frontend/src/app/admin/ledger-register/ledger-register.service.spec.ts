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
      .list({ associateId: 'a1', incomeType: 'ROYALTY', cycleId: 'c1', status: 'PAID' }, 0, 20)
      .subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/admin/ledger' &&
        r.params.get('associateId') === 'a1' &&
        r.params.get('incomeType') === 'ROYALTY' &&
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

  it('sends from/to alone or together on list and summary, omitting them when empty', () => {
    service.list({ from: '2026-10-01' }, 0, 20).subscribe();
    httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('from') === '2026-10-01' && !r.params.has('to'))
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    service.summary('', '', 0, 20, '', '2026-10-31').subscribe();
    httpMock.expectOne(r => r.url === '/api/admin/ledger/summary' && r.params.get('to') === '2026-10-31' && !r.params.has('from'))
      .flush({ rows: [], page: 0, size: 20, totalElements: 0 });

    service.summary('', '', 0, 20).subscribe();
    httpMock.expectOne('/api/admin/ledger/summary?page=0&size=20').flush({ rows: [], page: 0, size: 20, totalElements: 0 });
  });
});
