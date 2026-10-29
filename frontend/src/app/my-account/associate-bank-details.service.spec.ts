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
});
