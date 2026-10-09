import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AnnouncementFeedComponent } from './announcement-feed.component';

describe('AnnouncementFeedComponent', () => {
  let fixture: ComponentFixture<AnnouncementFeedComponent>;
  let httpMock: HttpTestingController;
  const URL = '/api/announcements';
  const el = () => fixture.nativeElement as HTMLElement;

  const first = { id: 'a1', title: 'Office closed', body: 'Line one\nLine two', publishedAt: '2026-03-15T12:00:00Z' };
  const second = { id: 'a2', title: 'Second', body: 'Body two', publishedAt: '2026-03-14T12:00:00Z' };

  function flushPage(entries: unknown[] = [first, second], total = entries.length, page = 0): void {
    httpMock
      .expectOne(r => r.url === URL && r.params.get('page') === String(page))
      .flush({ entries, page, size: 10, totalElements: total });
    fixture.detectChanges();
  }
  function failPage(page: number): void {
    httpMock.expectOne(r => r.url === URL && r.params.get('page') === String(page))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
  }
  const next = () => el().querySelector<HTMLButtonElement>('.announcement-feed__next')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnnouncementFeedComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(AnnouncementFeedComponent);
    httpMock = TestBed.inject(HttpTestingController);
    const t = TestBed.inject(TranslateService);
    t.setDefaultLang('en');
    t.setTranslation('en', {
      announcements: {
        feed: {
          eyebrow: 'Associate · Announcements', title: 'Announcements', subtitle: 'Company updates',
          loading: 'Loading announcements',
          loadError: "Couldn't load announcements. Check your connection and try again.",
          retryAction: 'Retry', emptyTitle: 'No announcements yet',
          emptyBody: 'When the company posts an update, it will appear here.',
          previousPageAction: 'Previous', nextPageAction: 'Next', pageIndicator: 'Page {{page}} of {{totalPages}}'
        }
      }
    });
    t.use('en');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads page 0 with size 10 on init', () => {
    const req = httpMock.expectOne(r => r.url === URL);
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('10');
    req.flush({ entries: [], page: 0, size: 10, totalElements: 0 });
  });

  it('shows skeleton cards (role=status, sr-only label, aria-busy) while loading and nothing is disabled', () => {
    expect(el().querySelectorAll('.announcement-feed__skeleton-card').length).toBe(3);
    expect(el().querySelector('[role=status]')!.textContent).toContain('Loading announcements');
    expect(el().querySelector('[aria-busy=true]')).toBeTruthy();
    expect(el().querySelector('[disabled]')).toBeNull();
    flushPage([]);
  });

  it('renders title, full multi-line body and a time element with datetime and dateline', () => {
    flushPage();
    const articles = el().querySelectorAll('article');
    expect(articles.length).toBe(2);
    expect(articles[0].querySelector('h2')!.textContent!.trim()).toBe('Office closed');
    expect(articles[1].querySelector('h2')!.textContent!.trim()).toBe('Second');
    const body = articles[0].querySelector('.announcement-feed__body')!;
    expect(body.textContent).toBe('Line one\nLine two');
    expect(articles[0].querySelector('time')!.getAttribute('datetime')).toBe('2026-03-15T12:00:00Z');
    expect(articles[0].querySelector('.announcement-feed__day')!.textContent).toBe('15');
    expect(articles[0].querySelector('.announcement-feed__month')!.textContent).toBe('Mar');
    expect(articles[0].querySelector('.announcement-feed__year')!.textContent).toBe('2026');
  });

  it('renders hostile text literally and a 300-char unbroken title in full', () => {
    const long = 'x'.repeat(300);
    flushPage([
      { id: 'h', title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script><b>x</b>', publishedAt: '2026-03-15T12:00:00Z' },
      { id: 'l', title: long, body: 'y'.repeat(5000), publishedAt: '2026-03-14T12:00:00Z' }
    ]);
    expect(el().querySelector('.announcement-feed img, .announcement-feed script, .announcement-feed b')).toBeNull();
    expect(el().textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el().textContent).toContain('<script>alert(1)</script><b>x</b>');
    expect(el().querySelectorAll('h2')[1].textContent!.trim().length).toBe(300);
    expect(el().querySelectorAll('.announcement-feed__body')[1].textContent!.length).toBe(5000);
  });

  it('empty page shows emptyTitle/emptyBody, no articles, no pager', () => {
    flushPage([]);
    expect(el().textContent).toContain('No announcements yet');
    expect(el().textContent).toContain('When the company posts an update, it will appear here.');
    expect(el().querySelectorAll('article').length).toBe(0);
    expect(el().querySelector('.announcement-feed__pagination')).toBeNull();
  });

  it('on error shows danger banner with Retry, role=alert only on the error text, hides feed and pager', () => {
    httpMock.expectOne(r => r.url === URL).flush('boom', { status: 500, statusText: 'x' });
    fixture.detectChanges();
    const alerts = el().querySelectorAll('[role=alert]');
    expect(alerts.length).toBe(1);
    expect(alerts[0].tagName).toBe('SPAN');
    expect(alerts[0].textContent).toContain("Couldn't load announcements");
    expect(alerts[0].querySelector('button')).toBeNull();
    expect(el().querySelector('.announcement-feed__retry')).toBeTruthy();
    expect(el().querySelector('.announcement-feed__list')).toBeNull();
    expect(el().querySelector('.announcement-feed__pagination')).toBeNull();
    el().querySelector<HTMLButtonElement>('.announcement-feed__retry')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.announcement-feed__retry')).toBeNull(); // not rendered while loading
    flushPage([first]);
  });

  it('retry() while a load is in flight issues no second request', () => {
    fixture.componentInstance.retry();
    flushPage([first]); // expectOne would throw if there were two requests
  });

  it('Retry after a failed later page re-requests THAT page', () => {
    flushPage([first], 25);
    next().click();
    failPage(1);
    el().querySelector<HTMLButtonElement>('.announcement-feed__retry')!.click();
    flushPage([second], 25, 1);
    expect(el().textContent).toContain('Page 2 of 3');
  });

  it('ignores a stale response that arrives after a newer request', () => {
    const c = fixture.componentInstance as any;
    const oldReq = httpMock.expectOne(r => r.params.get('page') === '0');
    c.loadPage(1); // supersede the in-flight request
    const newReq = httpMock.expectOne(r => r.params.get('page') === '1');
    newReq.flush({ entries: [second], page: 1, size: 10, totalElements: 25 });
    oldReq.flush({ entries: [first], page: 0, size: 10, totalElements: 25 });
    fixture.detectChanges();
    expect(el().textContent).toContain('Second');
    expect(el().textContent).not.toContain('Office closed');
  });

  it('pager buttons are aria-disabled, not disabled; goToPage ignores out-of-range', () => {
    flushPage([first], 1);
    const prev = el().querySelector<HTMLButtonElement>('.announcement-feed__prev')!;
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    expect(next().getAttribute('aria-disabled')).toBe('true');
    expect(prev.hasAttribute('disabled')).toBeFalse();
    expect(next().hasAttribute('disabled')).toBeFalse();
    fixture.componentInstance.goToPage(-1);
    fixture.componentInstance.goToPage(1);
    httpMock.verify();
  });

  it('rapid Next clicks while loading issue only one request', () => {
    flushPage([first], 25);
    next().click();
    next().click();
    flushPage([second], 25, 1);
  });

  it('Next loads the next page', () => {
    flushPage([first], 25);
    expect(el().textContent).toContain('Page 1 of 3');
    next().click();
    flushPage([second], 25, 1);
    expect(el().textContent).toContain('Page 2 of 3');
  });

  it('is view-only', () => {
    flushPage([first], 25);
    expect(el().querySelectorAll('input, textarea, select').length).toBe(0);
    const labels = Array.from(el().querySelectorAll('button')).map(b => b.textContent!.trim());
    expect(labels).toEqual(['Previous', 'Next']);
  });
});
