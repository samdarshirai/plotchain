import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SupportTicketHistoryComponent } from './support-ticket-history.component';

describe('SupportTicketHistoryComponent', () => {
  let fixture: ComponentFixture<SupportTicketHistoryComponent>;
  let httpMock: HttpTestingController;
  const URL = '/api/associates/me/support-tickets';

  const answered = {
    id: 't1', associateId: 'a1', associateUserId: 'U1', associateName: 'Asha',
    subject: 'Cannot see my invoice', description: 'Line one\nLine two',
    status: 'RESOLVED', response: 'Fixed it', respondedAt: '2026-01-07T00:00:00Z',
    createdAt: '2026-01-05T00:00:00Z', updatedAt: '2026-01-07T00:00:00Z'
  };
  const waiting = { ...answered, id: 't2', status: 'OPEN', response: null, respondedAt: null, subject: 'Other' };

  function flushPage(entries: unknown[] = [answered, waiting], total = entries.length, page = 0): void {
    httpMock
      .expectOne(r => r.url === URL && r.params.get('page') === String(page))
      .flush({ entries, page, size: 20, totalElements: total });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupportTicketHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SupportTicketHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    const t = TestBed.inject(TranslateService);
    t.setDefaultLang('en');
    t.setTranslation('en', {
      supportTickets: {
        eyebrow: 'Associate · Support Tickets', title: 'Support Tickets',
        subtitle: 'Requests our team has logged for you.',
        loading: 'Loading support tickets', statusFilterLabel: 'Status', statusFilterAllOption: 'All statuses',
        status: { OPEN: 'Open', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed' },
        columnSubject: 'Subject', columnStatus: 'Status', columnCreatedAt: 'Created', columnResponse: 'Admin response',
        awaitingReply: 'Awaiting a reply', loadError: "Couldn't load your support tickets.", retryAction: 'Retry',
        emptyState: 'No support tickets yet.', emptyStateFiltered: 'No tickets with this status.',
        previousPageAction: 'Previous', nextPageAction: 'Next', pageIndicator: 'Page {{page}} of {{totalPages}}'
      }
    });
    t.use('en');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads page 0 on init with no status param', () => {
    const req = httpMock.expectOne(r => r.url === URL);
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows skeleton rows (role=status, sr-only label) while loading and never disables the filter', () => {
    expect(fixture.nativeElement.querySelectorAll('.ticket-history__skeleton-row').length).toBe(3);
    expect(fixture.nativeElement.querySelector('[role="status"] .ticket-history__sr').textContent).toContain('Loading');
    expect(fixture.nativeElement.querySelector('select').disabled).toBeFalse(); // never disabled: keeps focus
    flushPage();
    expect(fixture.nativeElement.querySelector('.ticket-history__skeleton-row')).toBeNull();
  });

  it('renders subject, full multi-line description, status, and a quoted reply with stamp', () => {
    flushPage();
    const el: HTMLElement = fixture.nativeElement;
    const text = el.textContent;
    expect(text).toContain('Cannot see my invoice');
    expect(el.querySelector('.ticket-history__description')!.textContent).toBe('Line one\nLine two');
    expect(el.querySelector('.ticket-history__reply-text')!.textContent).toBe('Fixed it');
    expect(el.querySelector('.ticket-history__reply-stamp')!.textContent).toContain('2026');
    expect(text).toContain('Resolved');
    expect(el.querySelectorAll('.ticket-history__reply').length).toBe(1); // only the answered row has the rail
    expect(el.querySelector('.ticket-history__awaiting')!.textContent).toContain('Awaiting a reply');
    expect(el.querySelector('table.ticket-history__table')!.getAttribute('aria-label')).toBe('Support Tickets');
    expect(el.querySelectorAll('thead th[scope="col"]').length).toBe(4);
  });

  it('renders hostile ticket text (subject, description, response) as literal text, never markup', () => {
    flushPage([{
      ...answered,
      subject: '<img src=x onerror=alert(1)>',
      description: '<script>alert(1)</script> & "q"',
      response: '<b>bold</b> <img src=y onerror=alert(2)>'
    }]);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('td b')).toBeNull();
    expect(el.querySelector('.ticket-history__subject')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelector('.ticket-history__description')!.textContent).toBe('<script>alert(1)</script> & "q"');
    expect(el.querySelector('.ticket-history__reply-text')!.textContent).toBe('<b>bold</b> <img src=y onerror=alert(2)>');
  });

  it('applying a status filter resets to page 0 and sends status', () => {
    flushPage([answered], 45);
    fixture.componentInstance.goToPage(2);
    flushPage([answered], 45, 2);
    fixture.componentInstance.onStatusChange('RESOLVED');
    const req = httpMock.expectOne(r => r.url === URL && r.params.get('status') === 'RESOLVED');
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows the filtered empty state when a filter matches nothing, plain empty otherwise', () => {
    flushPage([], 0);
    expect(fixture.nativeElement.querySelector('.ticket-history__empty').textContent).toContain('No support tickets yet.');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    fixture.componentInstance.onStatusChange('CLOSED');
    httpMock.expectOne(r => r.params.get('status') === 'CLOSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ticket-history__empty').textContent).toContain('No tickets with this status.');
  });

  it('on error shows a danger banner with Retry, hides the table, and Retry re-requests', () => {
    httpMock.expectOne(r => r.url === URL).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-inline-banner .inline-banner--danger')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-inline-banner [role="alert"]')).toBeTruthy(); // alert on the text span only
    fixture.nativeElement.querySelector('.ticket-history__retry').click();
    flushPage();
    expect(fixture.nativeElement.querySelector('table.ticket-history__table')).toBeTruthy();
  });

  it('Retry after a failed later page re-requests THAT page with the current status', () => {
    fixture.componentInstance.onStatusChange('RESOLVED');
    const first = httpMock.expectOne(r => r.url === URL && r.params.get('status') === 'RESOLVED');
    first.flush({ entries: [answered], page: 0, size: 20, totalElements: 45 });
    httpMock.expectOne(r => r.url === URL && !r.params.has('status')).flush({ entries: [], page: 0, size: 20, totalElements: 0 }); // superseded initial load
    fixture.detectChanges();
    fixture.componentInstance.goToPage(2);
    httpMock.expectOne(r => r.params.get('page') === '2' && r.params.get('status') === 'RESOLVED')
      .flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    fixture.componentInstance.retry();
    const retried = httpMock.expectOne(r => r.url === URL);
    expect(retried.request.params.get('page')).toBe('2');
    expect(retried.request.params.get('status')).toBe('RESOLVED');
    retried.flush({ entries: [answered], page: 2, size: 20, totalElements: 45 });
    expect(fixture.componentInstance.loadError).toBeFalse();
    expect(fixture.componentInstance.page?.page).toBe(2);
  });

  it('ignores a stale response that arrives after a newer request', () => {
    const first = httpMock.expectOne(r => r.url === URL); // initial load, left pending
    fixture.componentInstance.onStatusChange('CLOSED');
    const second = httpMock.expectOne(r => r.params.get('status') === 'CLOSED');
    second.flush({ entries: [waiting], page: 0, size: 20, totalElements: 1 });
    first.flush({ entries: [answered], page: 0, size: 20, totalElements: 1 });
    fixture.detectChanges();
    expect(fixture.componentInstance.page?.entries[0].id).toBe('t2');
  });

  it('pager buttons are aria-disabled, not disabled, and goToPage ignores out-of-range pages', () => {
    flushPage([answered], 21);
    const prev: HTMLButtonElement = fixture.nativeElement.querySelector('.ticket-history__prev');
    expect(prev.disabled).toBeFalse();
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    fixture.componentInstance.goToPage(-1); // no request: afterEach httpMock.verify() would fail otherwise
    fixture.componentInstance.goToPage(2);
  });

  it('rapid Next clicks while a page is loading issue only one request', () => {
    flushPage([answered], 45);
    const next: HTMLButtonElement = fixture.nativeElement.querySelector('.ticket-history__next');
    next.click(); next.click(); next.click();
    const reqs = httpMock.match(r => r.url === URL);
    expect(reqs.length).toBe(1);
    expect(reqs[0].request.params.get('page')).toBe('1');
    reqs[0].flush({ entries: [answered], page: 1, size: 20, totalElements: 45 });
  });

  it('a status change during loading is still allowed and supersedes the pending request', () => {
    const first = httpMock.expectOne(r => r.url === URL); // initial load, pending
    fixture.componentInstance.onStatusChange('CLOSED');
    const second = httpMock.expectOne(r => r.params.get('status') === 'CLOSED');
    second.flush({ entries: [waiting], page: 0, size: 20, totalElements: 1 });
    first.flush({ entries: [answered], page: 0, size: 20, totalElements: 1 });
    expect(fixture.componentInstance.page?.entries[0].id).toBe('t2');
  });

  it('Next loads the next page', () => {
    flushPage([answered], 21);
    fixture.componentInstance.goToPage(1);
    flushPage([answered], 21, 1);
    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('is view-only: no inputs and no buttons in the table', () => {
    flushPage();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('table button').length).toBe(0);
  });
});
