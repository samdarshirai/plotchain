import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminService } from './admin.service';
import { CreateAssociateResponse } from './models/create-associate-response.model';
import { AssociateSummary } from './models/associate-summary.model';

describe('AdminService', () => {
  let service: AdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminService]
    });
    service = TestBed.inject(AdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const profile = {
    name: 'Jane Doe', panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', phone: '9876543210',
    state: 'Delhi', district: 'Central', address: 'Addr'
  };

  it('creates an associate and returns the assigned id and temporary password', () => {
    const mockResponse: CreateAssociateResponse = { associateId: 'assoc-1', userId: 'VP00001', temporaryPassword: 'Temp1234!', transactionPassword: 'Txn1234!' };

    service.createAssociate(profile).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(profile);
    req.flush(mockResponse);
  });

  it('sends sponsor and leg when provided', () => {
    service.createAssociate({ ...profile, sponsorUserId: 'VP00002', position: 'L' }).subscribe();

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.body).toEqual({ ...profile, sponsorUserId: 'VP00002', position: 'L' });
    req.flush({ associateId: 'assoc-1', userId: 'VP00001', temporaryPassword: 'Temp1234!', transactionPassword: 'Txn1234!' });
  });

  it('lists associates for the parent picker', () => {
    const mockResponse: AssociateSummary[] = [{ id: 'assoc-1', userId: 'VP00001', name: 'Root Left', role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: true }];

    service.listAssociates().subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
