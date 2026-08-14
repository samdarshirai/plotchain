import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { IncomeStatementService } from './income-statement.service';
import { AssociateLedgerPage } from './models/associate-ledger-page.model';

describe('IncomeStatementService', () => {
  let service: IncomeStatementService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [IncomeStatementService]
    });
    service = TestBed.inject(IncomeStatementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches my ledger entries with filters and pagination as query params', () => {
    const mockResponse: AssociateLedgerPage = { entries: [], page: 0, size: 20, totalElements: 0 };

    service
      .list({ incomeType: 'PERK', cycleId: 'c1', status: 'PAID' }, 0, 20)
      .subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/associates/me/ledger' &&
        r.params.get('incomeType') === 'PERK' &&
        r.params.get('cycleId') === 'c1' &&
        r.params.get('status') === 'PAID' &&
        r.params.get('page') === '0' &&
        r.params.get('size') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined, sending only page/size when unfiltered', () => {
    service.list({}, 1, 100).subscribe();

    const req = httpMock.expectOne('/api/associates/me/ledger?page=1&size=100');
    req.flush({ entries: [], page: 1, size: 100, totalElements: 0 });
  });
});
