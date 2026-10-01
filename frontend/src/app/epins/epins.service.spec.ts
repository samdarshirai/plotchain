import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { EPinsService } from './epins.service';

describe('EPinsService', () => {
  let service: EPinsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(EPinsService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('lists my pins with an optional status and paging', () => {
    service.list('ALLOCATED', 0, 100).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    expect(req.request.params.get('status')).toBe('ALLOCATED');
    expect(req.request.params.get('size')).toBe('100');
    req.flush({ epins: [], page: 0, size: 100, totalElements: 0 });
  });

  it('fetches the caller id from the profile', () => {
    let id = '';
    service.meId().subscribe(v => (id = v));
    httpMock.expectOne('/api/associates/me/profile').flush({ id: 'me-1', name: 'x' });
    expect(id).toBe('me-1');
  });

  it('omits status when unfiltered', () => {
    service.list(undefined, 0, 20).subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/epins');
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ epins: [], page: 0, size: 20, totalElements: 0 });
  });

  it('redeems and transfers by human userId', () => {
    service.redeem('p1', 'VP00042').subscribe();
    let req = httpMock.expectOne('/api/associates/me/epins/p1/redeem');
    expect(req.request.body).toEqual({ userId: 'VP00042' });
    req.flush({});

    service.transfer('p1', 'VP00050').subscribe();
    req = httpMock.expectOne('/api/associates/me/epins/p1/transfer');
    expect(req.request.body).toEqual({ toUserId: 'VP00050' });
    req.flush({});
  });
});
