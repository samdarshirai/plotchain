import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EPinRegisterService } from './epin-register.service';

describe('EPinRegisterService', () => {
  let service: EPinRegisterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(EPinRegisterService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('lists with set filters and paging as query params, omitting empty ones', () => {
    service.list({ status: 'ALLOCATED', batchId: '', expired: true }, 1, 20).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.get('status')).toBe('ALLOCATED');
    expect(req.request.params.get('expired')).toBe('true');
    expect(req.request.params.has('batchId')).toBeFalse();
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ epins: [], page: 1, size: 20, totalElements: 0 });
  });

  it('omits expired when false', () => {
    service.list({ expired: false }, 0, 20).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/admin/epins');
    expect(req.request.params.has('expired')).toBeFalse();
    req.flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('generates a batch with optional expiry', () => {
    service.generate(5, '2027-01-01T00:00:00Z').subscribe();
    const req = httpMock.expectOne('/api/admin/epins');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ count: 5, expiresAt: '2027-01-01T00:00:00Z' });
    req.flush({});
  });

  it('allocates, blocks, unblocks, redeems and fetches events on the right endpoints', () => {
    service.allocate('a1', 3, 'b1').subscribe();
    let req = httpMock.expectOne('/api/admin/epins/allocate');
    expect(req.request.body).toEqual({ associateId: 'a1', count: 3, batchId: 'b1' });
    req.flush({});

    service.block('p1', 'lost').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/block');
    expect(req.request.body).toEqual({ reason: 'lost' });
    req.flush({});

    service.unblock('p1').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/unblock');
    expect(req.request.method).toBe('POST');
    req.flush({});

    service.redeem('p1', 'a1', 'ACTIVATION').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/redeem');
    expect(req.request.body).toEqual({ associateId: 'a1', redemptionType: 'ACTIVATION' });
    req.flush({});

    service.events('p1').subscribe();
    req = httpMock.expectOne('/api/admin/epins/p1/events');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
