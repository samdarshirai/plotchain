import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminAnnouncementsComponent } from './admin-announcements.component';

describe('AdminAnnouncementsComponent', () => {
  let fixture: ComponentFixture<AdminAnnouncementsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  // built from local parts so the day/month assertions do not depend on the machine's time zone
  const at = (d: number, h = 14, m = 2) => new Date(2026, 9, d, h, m).toISOString();
  const an = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'Title ' + id, body: 'Body ' + id, publishedAt: at(9), ...over });
  const pageOf = (entries: unknown[], total = entries.length, page = 0) => ({ entries, page, size: 10, totalElements: total });
  const listReq = () => http.expectOne(r => r.url === '/api/announcements' && r.method === 'GET');
  const next = () => el().querySelector<HTMLButtonElement>('.announcement-composer__next')!;
  const prev = () => el().querySelector<HTMLButtonElement>('.announcement-composer__prev')!;

  function boot(entries: unknown[] = [an('a1'), an('a2')], total?: number) {
    listReq().flush(pageOf(entries, total));
    fixture.detectChanges();
  }
  function publishViaForm(title = 'New one', body = 'Fresh') {
    const t = el().querySelector<HTMLInputElement>('#announcement-composer-title')!;
    const b = el().querySelector<HTMLTextAreaElement>('#announcement-composer-body')!;
    t.value = title; t.dispatchEvent(new Event('input'));
    b.value = body; b.dispatchEvent(new Event('input'));
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('first load asks for page 0 with size 10', () => {
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('size')).toBe('10');
    r.flush(pageOf([]));
  });

  it('renders each notice with day, month/year, title, body and a published line; body is plain text', () => {
    boot([an('a1', { title: 'Diwali cycle', body: 'Line 1\nLine 2 <b>x</b> https://example.com' })]);
    const item = el().querySelector('.announcement-composer__item')!;
    expect(item.querySelector('.announcement-composer__day')!.textContent!.trim()).toBe('09');
    expect(item.querySelector('.announcement-composer__mon')!.textContent).toContain('Oct');
    expect(item.querySelector('.announcement-composer__item-title')!.textContent).toContain('Diwali cycle');
    const body = item.querySelector('.announcement-composer__body')!;
    expect(body.textContent).toContain('Line 1\nLine 2 <b>x</b> https://example.com');
    expect(body.querySelector('b, a')).toBeNull();
    // the untranslated test loader prints the key, so the date text is asserted via the translate params
    expect(item.querySelector('.announcement-composer__time')!.textContent).toContain('announcements.composer.list.published');
    expect(item.querySelector('button, a, [tabindex]')).toBeNull(); // nothing selectable, no edit/delete
  });

  it('header shows the count with singular and plural forms', () => {
    boot([an('a1'), an('a2')], 13);
    expect(el().querySelector('.announcement-composer__count')!.textContent).toContain('announcements.composer.list.count');
    fixture.componentInstance.page = { entries: [an('a1')], page: 0, size: 10, totalElements: 1 };
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__count')!.textContent).toContain('announcements.composer.list.countOne');
  });

  it('shows a skeleton with role=status while loading and a polite live count only', () => {
    const sk = el().querySelector('.announcement-composer__skeleton')!;
    expect(sk.getAttribute('role')).toBe('status');
    expect(el().querySelector('.announcement-composer__list')!.getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector('.announcement-composer__list')!.hasAttribute('aria-live')).toBeFalse();
    expect(el().querySelector('.announcement-composer__count')!.getAttribute('aria-live')).toBe('polite');
    expect(el().querySelector('.announcement-composer__form-host button:disabled')).toBeNull(); // form stays usable
    listReq().flush(pageOf([]));
  });

  it('shows the empty state with no CTA button', () => {
    boot([]);
    const empty = el().querySelector('.announcement-composer__empty')!;
    expect(empty.textContent).toContain('announcements.composer.list.empty.title');
    expect(empty.querySelector('button')).toBeNull();
    expect(el().querySelector('.announcement-composer__pager')).toBeNull();
  });

  it('load failure: danger banner (role=alert on text only) and Retry re-requests', () => {
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    const alert = el().querySelector('.announcement-composer__list [role="alert"]')!;
    expect(alert.tagName).toBe('SPAN');
    expect(alert.textContent).toContain('announcements.composer.err.load');
    expect(el().querySelector('.announcement-composer__skeleton')).toBeNull();
    el().querySelector<HTMLButtonElement>('.announcement-composer__retry')!.click();
    listReq().flush(pageOf([an('a1')]));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__list [role="alert"]')).toBeNull();
  });

  it('pages: Next requests page 1; Previous is aria-disabled on page 1 and Next on the last page, never disabled', () => {
    boot([an('a1')], 25);
    expect(prev().getAttribute('aria-disabled')).toBe('true');
    expect(prev().disabled).toBeFalse();
    next().click();
    const r = listReq();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([an('a9')], 25, 1));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__page')!.textContent).toContain('announcements.composer.list.pager');
    next().focus();
    fixture.componentInstance.goTo(2);
    listReq().flush(pageOf([an('a10')], 25, 2));
    fixture.detectChanges();
    expect(next().getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(next());
    next().click(); // inert at the end
    http.expectNone(r2 => r2.url === '/api/announcements');
  });

  it('ignores a page change while a load is in flight', () => {
    boot([an('a1')], 25);
    next().click();
    const pending = listReq();
    next().click();
    fixture.componentInstance.goTo(2);
    http.expectNone(r => r.url === '/api/announcements');
    pending.flush(pageOf([an('a2')], 25, 1));
  });

  it('latest request wins: a slow older response cannot overwrite a newer one', () => {
    boot([an('a1')], 25);
    next().click();
    const slow = listReq();                       // page 1, in flight
    fixture.componentInstance.onPublished(an('new') as never); // forces load(0) and bumps the sequence
    const fast = listReq();
    fast.flush(pageOf([an('new')], 26, 0));
    slow.flush(pageOf([an('old')], 25, 1));
    fixture.detectChanges();
    expect(el().textContent).toContain('Title new');
    expect(el().textContent).not.toContain('Title old');
  });

  it('long bodies get a Show full text toggle with aria-expanded; short ones do not', () => {
    boot([an('long', { body: 'x'.repeat(200) }), an('short', { body: 'Hi' })]);
    const items = el().querySelectorAll('.announcement-composer__item');
    expect(items[1].querySelector('.announcement-composer__more')).toBeNull();
    const more = items[0].querySelector<HTMLButtonElement>('.announcement-composer__more')!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.textContent).toContain('announcements.composer.list.showFull');
    more.focus(); // a real click focuses the button; programmatic click() does not
    more.click(); fixture.detectChanges();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent).toContain('announcements.composer.list.showLess');
    expect(items[0].querySelector('.announcement-composer__body')!.classList).toContain('is-open');
    expect(document.activeElement).toBe(more);
  });

  it('publishing: success banner (role=status, dismissible) with the title, list reloads page 0, new top item carries the chip', () => {
    boot([an('a1')]);
    publishViaForm('Fresh news', 'Body text');
    http.expectOne('/api/admin/announcements').flush(an('n1', { title: 'Fresh news' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    const status = el().querySelector('.inline-banner--success [role="status"]')!;
    expect(status.textContent).toContain('announcements.composer.ok.published');
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([an('n1', { title: 'Fresh news' }), an('a1')], 2));
    fixture.detectChanges();
    const first = el().querySelector('.announcement-composer__item')!;
    expect(first.classList).toContain('announcement-composer__item--new');
    expect(first.querySelector('.announcement-composer__chip')).not.toBeNull();
    expect(el().querySelectorAll('.announcement-composer__chip').length).toBe(1);
    el().querySelector<HTMLButtonElement>('.inline-banner__dismiss')!.click(); fixture.detectChanges();
    expect(el().querySelector('.inline-banner--success')).toBeNull();
  });

  it('keeps the chip out of the heading so the heading name is just the title, and only on the new item', () => {
    boot([an('a1')]);
    fixture.componentInstance.onPublished(an('n1', { title: 'Fresh' }) as never);
    listReq().flush(pageOf([an('n1', { title: 'Fresh' }), an('a1')], 2));
    fixture.detectChanges();
    const items = el().querySelectorAll('.announcement-composer__item');
    const h = items[0].querySelector('.announcement-composer__item-title')!;
    expect(h.textContent!.trim()).toBe('Fresh');
    expect(h.querySelector('.announcement-composer__chip')).toBeNull();
    expect(items[0].querySelectorAll('.announcement-composer__chip').length).toBe(1);
    expect(items[1].querySelector('.announcement-composer__chip')).toBeNull();
  });

  it('Retry is inert while a publish is in flight and works again after it settles', () => {
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    publishViaForm();
    const pub = http.expectOne('/api/admin/announcements');
    el().querySelector<HTMLButtonElement>('.announcement-composer__retry')!.click();
    http.expectNone(r => r.url === '/api/announcements');
    pub.flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.announcement-composer__retry')!.click();
    listReq().flush(pageOf([an('a1')]));
  });

  it('publish succeeds while the list is errored: success banner shows and the list load is retried', () => {
    listReq().flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    publishViaForm();
    http.expectOne('/api/admin/announcements').flush(an('n1'), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(el().querySelector('.inline-banner--success')).not.toBeNull();
    listReq().flush(pageOf([an('n1')]));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__list [role="alert"]')).toBeNull();
  });

  it('locks the pager and Retry while a publish is in flight, clears the old flash when a new one starts, and unlocks after', () => {
    boot([an('a1')], 25);
    fixture.componentInstance.flash = { key: 'announcements.composer.ok.published', params: { title: 'Old' } };
    fixture.detectChanges();
    publishViaForm();
    expect(fixture.componentInstance.locked).toBeTrue();
    expect(fixture.componentInstance.flash).toBeNull();
    expect(next().getAttribute('aria-disabled')).toBe('true');
    next().click();
    http.expectNone(r => r.url === '/api/announcements');
    http.expectOne('/api/admin/announcements').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(fixture.componentInstance.locked).toBeFalse();
  });

  it('using the pager clears the just-published marker', () => {
    boot([an('a1')], 25);
    fixture.componentInstance.onPublished(an('a1') as never);
    listReq().flush(pageOf([an('a1')], 25));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__chip')).not.toBeNull();
    next().click();
    listReq().flush(pageOf([an('a1')], 25, 1));
    fixture.detectChanges();
    expect(el().querySelector('.announcement-composer__chip')).toBeNull();
  });

  it('puts the compose form before the list in DOM order (mobile shows it first; no CSS order hack)', () => {
    const form = el().querySelector('.announcement-composer__form-host')!;
    const list = el().querySelector('.announcement-composer__list')!;
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    listReq().flush(pageOf([]));
  });
});
