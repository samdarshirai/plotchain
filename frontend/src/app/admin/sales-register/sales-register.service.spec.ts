import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage } from '../models/admin-sale-page.model';

describe('SalesRegisterService', () => {
  let service: SalesRegisterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SalesRegisterService]
    });
    service = TestBed.inject(SalesRegisterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists sales with filters and pagination as query params', () => {
    const mockResponse: AdminSalePage = { sales: [], page: 0, size: 20, totalElements: 0 };

    service.list({ search: 'a1', status: 'RECORDED' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/sales' && r.params.get('search') === 'a1' && r.params.get('status') === 'RECORDED'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/sales?page=0&size=20');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });
});
