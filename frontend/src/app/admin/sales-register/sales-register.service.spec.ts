import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage } from '../models/admin-sale-page.model';
import { Sale } from '../models/sale.model';

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

    service.list({ associateId: 'a1', status: 'RECORDED' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/sales' && r.params.get('associateId') === 'a1' && r.params.get('status') === 'RECORDED'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/sales?page=0&size=20');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('records a sale', () => {
    const mockSale = { id: 's1', status: 'RECORDED' } as Sale;

    service
      .record({
        plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
        projectId: 'proj-1', price: 120000, note: 'Sold to Jane'
      })
      .subscribe(res => expect(res).toEqual(mockSale));

    const req = httpMock.expectOne('/api/admin/sales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
      projectId: 'proj-1', price: 120000, note: 'Sold to Jane'
    });
    req.flush(mockSale);
  });

  it('voids a sale with a reason', () => {
    const mockSale = { id: 's1', status: 'VOIDED', voidReason: 'Buyer cancelled' } as Sale;

    service.voidSale('s1', 'Buyer cancelled').subscribe(res => expect(res).toEqual(mockSale));

    const req = httpMock.expectOne('/api/admin/sales/s1/void');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Buyer cancelled' });
    req.flush(mockSale);
  });
});
