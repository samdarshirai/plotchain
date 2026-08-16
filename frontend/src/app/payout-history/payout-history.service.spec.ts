import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PayoutHistoryService } from './payout-history.service';
import { AssociateWithdrawalPage } from './models/associate-withdrawal-page.model';
import { WalletBalance } from './models/wallet-balance.model';

describe('PayoutHistoryService', () => {
  let service: PayoutHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PayoutHistoryService]
    });
    service = TestBed.inject(PayoutHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the current wallet balance', () => {
    const mockResponse: WalletBalance = { balance: 12500 };

    service.getWallet().subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/associates/me/wallet');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('fetches my withdrawal history with a status filter and pagination as query params', () => {
    const mockResponse: AssociateWithdrawalPage = { requests: [], page: 0, size: 20, totalElements: 0 };

    service.list({ status: 'DISBURSED' }, 0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/associates/me/withdrawals' &&
        r.params.get('status') === 'DISBURSED' &&
        r.params.get('page') === '0' &&
        r.params.get('size') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits the status param when unfiltered, sending only page/size', () => {
    service.list({}, 1, 100).subscribe();

    const req = httpMock.expectOne('/api/associates/me/withdrawals?page=1&size=100');
    req.flush({ requests: [], page: 1, size: 100, totalElements: 0 });
  });
});
