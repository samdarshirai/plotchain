import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SupportTicketService } from './support-ticket.service';

describe('SupportTicketService', () => {
  let s: SupportTicketService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    s = TestBed.inject(SupportTicketService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists with only the set filters plus paging', () => {
    s.list({ status: 'OPEN', associateId: '' }, 2, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/support-tickets');
    expect(r.request.method).toBe('GET');
    expect(r.request.params.get('status')).toBe('OPEN');
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('associateId')).toBeFalse();
    r.flush({ entries: [], page: 2, size: 20, totalElements: 0 });
  });

  it('omits both filters when unset and sends associateId when set', () => {
    s.list({ status: '', associateId: 'a1' }, 0, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/support-tickets');
    expect(r.request.params.has('status')).toBeFalse();
    expect(r.request.params.get('associateId')).toBe('a1');
    r.flush({});
  });

  it('creates a ticket by POST', () => {
    s.create({ associateId: 'a1', subject: 'S', description: 'D' }).subscribe();
    const r = http.expectOne('/api/admin/support-tickets');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ associateId: 'a1', subject: 'S', description: 'D' });
    r.flush({});
  });

  it('responds by POST to the ticket id', () => {
    s.respond('t1', { status: 'RESOLVED', response: 'Done' }).subscribe();
    const r = http.expectOne('/api/admin/support-tickets/t1/respond');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ status: 'RESOLVED', response: 'Done' });
    r.flush({});
  });
});
