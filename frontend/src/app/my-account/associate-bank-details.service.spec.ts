import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateBankDetailsService } from './associate-bank-details.service';
import { AssociateBankDetailsResponse } from './models/associate-bank-details.model';

describe('AssociateBankDetailsService', () => {
  let service: AssociateBankDetailsService;
  let httpMock: HttpTestingController;

  const mockResponse: AssociateBankDetailsResponse = {
    bankName: 'State Bank', accountHolder: 'Jane Doe', accountNumber: '123456789012',
    ifscCode: 'SBIN0001234', accountType: 'SAVINGS', updatedAt: '2026-01-01T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AssociateBankDetailsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own bank details from GET /api/associates/me/bank-details', () => {
    let result: AssociateBankDetailsResponse | undefined;
    service.getBankDetails().subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/bank-details');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    expect(result).toEqual(mockResponse);
  });

  it('sends an update via PUT /api/associates/me/bank-details with the request body', () => {
    let result: AssociateBankDetailsResponse | undefined;
    service.updateBankDetails({
      bankName: 'HDFC Bank', accountHolder: 'Jane Doe', accountNumber: '987654321098',
      ifscCode: 'HDFC0001234', accountType: 'CURRENT'
    }).subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/bank-details');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      bankName: 'HDFC Bank', accountHolder: 'Jane Doe', accountNumber: '987654321098',
      ifscCode: 'HDFC0001234', accountType: 'CURRENT'
    });
    req.flush({ ...mockResponse, bankName: 'HDFC Bank' });

    expect(result?.bankName).toBe('HDFC Bank');
  });

  it('propagates a 400 validation error on the update call without swallowing it', () => {
    let error: any;
    service.updateBankDetails({
      bankName: 'State Bank', accountHolder: 'Jane Doe', accountNumber: '123456789012',
      ifscCode: 'not-an-ifsc', accountType: 'SAVINGS'
    }).subscribe({ error: err => (error = err) });

    httpMock.expectOne('/api/associates/me/bank-details')
      .flush({ error: 'Invalid IFSC code' }, { status: 400, statusText: 'Bad Request' });

    expect(error.status).toBe(400);
  });
});
