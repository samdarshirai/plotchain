import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';

describe('SalesHistoryService', () => {
  let service: SalesHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SalesHistoryService]
    });
    service = TestBed.inject(SalesHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own and descendant sales with page/size as query params', () => {
    const mockResponse: AssociateSalePage = { sales: [], page: 0, size: 20, totalElements: 0 };

    service.getMySales(0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates/me/sales?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('requests a later page with the requested page/size', () => {
    service.getMySales(2, 10).subscribe();

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/sales' && r.params.get('page') === '2' && r.params.get('size') === '10'
    );
    req.flush({ sales: [], page: 2, size: 10, totalElements: 0 });
  });
});
