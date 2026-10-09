import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AnnouncementService } from './announcement.service';

describe('AnnouncementService', () => {
  let s: AnnouncementService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    s = TestBed.inject(AnnouncementService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists the feed with page and size only', () => {
    s.list(2, 10).subscribe();
    const r = http.expectOne(x => x.url === '/api/announcements');
    expect(r.request.method).toBe('GET');
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('10');
    expect(r.request.params.keys().sort()).toEqual(['page', 'size']);
    r.flush({ entries: [], page: 2, size: 10, totalElements: 0 });
  });

  it('publishes by POST to the admin endpoint with exactly title and body', () => {
    let got: unknown;
    s.publish({ title: 'T', body: 'B' }).subscribe(a => (got = a));
    const r = http.expectOne('/api/admin/announcements');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ title: 'T', body: 'B' });
    r.flush({ id: 'a1', title: 'T', body: 'B', publishedAt: '2026-10-09T08:00:00Z' }, { status: 201, statusText: 'Created' });
    expect(got).toEqual({ id: 'a1', title: 'T', body: 'B', publishedAt: '2026-10-09T08:00:00Z' });
  });
});
