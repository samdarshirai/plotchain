import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';

describe('AssociateDirectoryService', () => {
  let service: AssociateDirectoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AssociateDirectoryService]
    });
    service = TestBed.inject(AssociateDirectoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists associates with filters and pagination as query params', () => {
    const mockResponse: AdminAssociatePage = { associates: [], page: 0, size: 20, totalElements: 0 };

    service.list({ search: 'jane', status: 'ACTIVE' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/associates' && r.params.get('search') === 'jane' && r.params.get('status') === 'ACTIVE'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined', () => {
    service.list({}, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/associates?page=0&size=20');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('gets a single associate detail', () => {
    const mockDetail = { id: 'a1', userId: 'VP00001' } as AdminAssociateDetail;

    service.get('a1').subscribe(res => expect(res).toEqual(mockDetail));

    const req = httpMock.expectOne('/api/admin/associates/a1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDetail);
  });

  it('suspends an associate', () => {
    service.suspend('a1').subscribe();

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('reactivates an associate', () => {
    service.reactivate('a1').subscribe();

    const req = httpMock.expectOne('/api/admin/associates/a1/reactivate');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('resets an associate password', () => {
    service.resetPassword('a1').subscribe(res => expect(res.temporaryPassword).toBe('Temp1234!'));

    const req = httpMock.expectOne('/api/admin/associates/a1/reset-password');
    expect(req.request.method).toBe('POST');
    req.flush({ temporaryPassword: 'Temp1234!' });
  });
});
