import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateKycService } from './associate-kyc.service';
import { AssociateKycStatusResponse, KycDocumentSummary } from './models/associate-kyc-status.model';

describe('AssociateKycService', () => {
  let service: AssociateKycService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AssociateKycService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches KYC status and documents from GET /api/associates/me/kyc', () => {
    let result: AssociateKycStatusResponse | undefined;
    service.getStatus().subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/kyc');
    expect(req.request.method).toBe('GET');
    const mockResponse: AssociateKycStatusResponse = {
      kycStatus: 'PENDING',
      documents: [{ documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-01T00:00:00Z' }]
    };
    req.flush(mockResponse);

    expect(result).toEqual(mockResponse);
  });

  it('uploads a document as multipart/form-data to POST /api/associates/me/kyc/documents/{type}', () => {
    let result: KycDocumentSummary | undefined;
    const file = new File(['dummy'], 'aadhaar.png', { type: 'image/png' });
    service.uploadDocument('AADHAAR', file).subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    const summary: KycDocumentSummary = { documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' };
    req.flush(summary);

    expect(result).toEqual(summary);
  });

  it('propagates a 400 on an unsupported content type without swallowing it', () => {
    let error: any;
    const file = new File(['dummy'], 'aadhaar.gif', { type: 'image/gif' });
    service.uploadDocument('AADHAAR', file).subscribe({ error: err => (error = err) });

    httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR')
      .flush({ error: 'unsupported document content type: image/gif' }, { status: 400, statusText: 'Bad Request' });

    expect(error.status).toBe(400);
  });
});
