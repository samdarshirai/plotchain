import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminWithdrawalPage } from '../models/admin-withdrawal-page.model';
import { AdminWithdrawalRequest } from '../models/withdrawal-request.model';

describe('PayoutApprovalService', () => {
  let service: PayoutApprovalService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PayoutApprovalService]
    });
    service = TestBed.inject(PayoutApprovalService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists withdrawal requests with filters and pagination as query params', () => {
    const mockResponse: AdminWithdrawalPage = { requests: [], page: 0, size: 20, totalElements: 0 };

    service.list({ associateId: 'a1', status: 'REQUESTED' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/withdrawals' && r.params.get('associateId') === 'a1' && r.params.get('status') === 'REQUESTED'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/withdrawals?page=0&size=20');
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('submits a withdrawal request on an associate\'s behalf', () => {
    const mockRequest = { id: 'w1', status: 'REQUESTED' } as AdminWithdrawalRequest;

    service.submit({ associateId: 'a1', amount: 5000 }).subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ associateId: 'a1', amount: 5000 });
    req.flush(mockRequest);
  });

  it('decides (approves) a withdrawal request with no reason', () => {
    const mockRequest = { id: 'w1', status: 'APPROVED' } as AdminWithdrawalRequest;

    service.decide('w1', 'APPROVED').subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'APPROVED', reason: undefined });
    req.flush(mockRequest);
  });

  it('decides (rejects/cancels) a withdrawal request with a reason', () => {
    const mockRequest = { id: 'w1', status: 'REJECTED' } as AdminWithdrawalRequest;

    service.decide('w1', 'REJECTED', 'Duplicate request').subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Duplicate request' });
    req.flush(mockRequest);
  });

  it('disburses an approved withdrawal request with a bank reference', () => {
    const mockRequest = { id: 'w1', status: 'DISBURSED' } as AdminWithdrawalRequest;

    service.disburse('w1', 'NEFT-12345').subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/disburse');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bankReference: 'NEFT-12345' });
    req.flush(mockRequest);
  });
});
