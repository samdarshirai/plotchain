import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CompanyProfileService } from './company-profile.service';
import { CompanyProfileRequest, CompanyProfileResponse } from '../../models/company-profile.model';

describe('CompanyProfileService', () => {
  let service: CompanyProfileService;
  let httpMock: HttpTestingController;

  const response: CompanyProfileResponse = {
    displayName: 'Plotchain Estates',
    legalName: 'Plotchain Estates Private Limited',
    registrationNumber: '',
    contactName: 'Jane Doe',
    contactPhone: '+919876543210',
    contactEmail: 'jane@plotchain.test',
    registeredAddress: '123 MG Road, Bengaluru',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CompanyProfileService]
    });
    service = TestBed.inject(CompanyProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the company profile', () => {
    let result: CompanyProfileResponse | undefined;
    service.getProfile().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/profile');
    expect(req.request.method).toBe('GET');
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('saves the company profile', () => {
    const request: CompanyProfileRequest = {
      displayName: response.displayName,
      legalName: response.legalName,
      registrationNumber: response.registrationNumber,
      contactName: response.contactName,
      contactPhone: response.contactPhone,
      contactEmail: response.contactEmail,
      registeredAddress: response.registeredAddress
    };
    let result: CompanyProfileResponse | undefined;
    service.updateProfile(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(response);

    expect(result).toEqual(response);
  });
});
