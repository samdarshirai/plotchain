import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { PaymentQueueComponent } from './payment-queue.component';
import { ReportFiltersComponent } from './report-filters.component';

const row = (b: string, n: number, amount = 250, over: Record<string, unknown> = {}) => ({
  bookingId: b, installmentNumber: n, paymentDate: '2026-03-02T00:00:00Z', associateCode: 'VA-1', associateName: 'Jane', projectName: 'Alpha',
  plotNo: 'A-1', amount, paymentMode: 'BANK_TRANSFER', paymentRef: 'R', entryBy: 'staff', confirmBy: null, confirmedAt: null, ...over });
const pageOf = (rows: any[], over: Record<string, unknown> = {}) => ({ payments: rows, page: 0, size: 20, totalElements: rows.length, pageTotal: rows.reduce((s, r) => s + r.amount, 0), grandTotal: 9999, ...over });

describe('PaymentQueueComponent', () => {
  let fixture: ComponentFixture<PaymentQueueComponent>;
  let component: PaymentQueueComponent;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const flushProjects = () => http.expectOne('/api/company/projects').flush([]);
  const listReq = () => http.expectOne(r => r.url === '/api/admin/payments');
  const confirmReq = () => http.expectOne('/api/admin/payments/confirm');
  const filters = () => fixture.debugElement.query(By.directive(ReportFiltersComponent)).componentInstance as ReportFiltersComponent;
  const pager = () => fixture.debugElement.query(By.directive(PagerComponent)).componentInstance as PagerComponent;
  const rows3 = () => [row('b1', 1), row('b2', 1), row('b3', 2, 500)];

  function boot(data: object = pageOf([row('b1', 1), row('b2', 1)])) {
    flushProjects();
    listReq().flush(data);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaymentQueueComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(PaymentQueueComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('loads ENTERED payments page 0 size 20 on init', () => {
    flushProjects();
    const r = listReq();
    expect(r.request.params.get('status')).toBe('ENTERED');
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('size')).toBe('20');
    ['from', 'to', 'projectId'].forEach(k => expect(r.request.params.has(k)).toBeFalse());
    r.flush(pageOf([]));
  });

  it('shows ONE seal card whose figure is the server grandTotal in INR and the pending count caption', () => {
    boot();
    expect(el().querySelectorAll('app-seal-card').length).toBe(1);
    expect(el().querySelector('app-seal-card')!.textContent).toContain('₹9,999');
    expect(el().querySelector('app-seal-card')!.textContent).toContain('admin.bookingsEmi.queue.sealCaption');
  });

  it('renders a row per payment with data-labels on every cell', () => {
    boot();
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
    el().querySelectorAll('tbody td').forEach(td => expect(td.getAttribute('data-label')).toBeTruthy());
  });

  it('renders the Total row from pageTotal', () => {
    boot();
    expect(el().querySelector('tfoot')!.textContent).toContain('₹500');
  });

  it('shows a skeleton until the first response', () => {
    flushProjects();
    expect(el().querySelector('.booking-register__skeleton')).not.toBeNull();
    listReq().flush(pageOf([row('b1', 1)]));
    fixture.detectChanges();
    expect(el().querySelector('.booking-register__skeleton')).toBeNull();
  });

  it('shows the empty state when there are no payments', () => {
    boot(pageOf([]));
    expect(el().textContent).toContain('admin.bookingsEmi.empty.queueTitle');
    expect(el().querySelector('app-seal-card')).toBeNull();
  });

  it('shows an error banner with Retry when the load fails, and Retry reloads', () => {
    flushProjects();
    listReq().flush({}, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.loadList');
    (el().querySelector('.booking-register__retry') as HTMLButtonElement).click();
    listReq().flush(pageOf([row('b1', 1)]));
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('a filter change reloads page 0 with from, to and projectId', () => {
    boot();
    filters().filtersChange.emit({ from: '2026-03-01', to: '2026-03-31', projectId: 'p1' });
    const r = listReq();
    expect(r.request.params.get('from')).toBe('2026-03-01');
    expect(r.request.params.get('to')).toBe('2026-03-31');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('paging requests the chosen page', () => {
    boot(pageOf([row('b1', 1)], { totalElements: 45 }));
    pager().pageChange.emit(1);
    const r = listReq();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([], { page: 1 }));
  });

  it('ignores a stale response that arrives after a newer one', () => {
    boot();
    filters().filtersChange.emit({ from: '', to: '', projectId: 'p1' });
    const first = listReq();
    filters().filtersChange.emit({ from: '', to: '', projectId: 'p2' });
    const second = listReq();
    second.flush(pageOf([row('new', 1)]));
    first.flush(pageOf([row('old', 1), row('old2', 1)]));
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  describe('selection and confirm', () => {
    const reload = (data: object = pageOf([])) => { listReq().flush(data); fixture.detectChanges(); };
    const click = (sel: string) => { (el().querySelector(sel) as HTMLButtonElement).click(); fixture.detectChanges(); };
    const bootRows = () => boot(pageOf(rows3()));
    const openPrompt = () => { bootRows(); click('.payment-queue__check-all'); click('.payment-queue__confirm'); };

    it('Check all selects every row on the page and shows count and amount', () => {
      bootRows(); click('.payment-queue__check-all');
      expect(component.selected.size).toBe(3);
      expect(component.selectedTotal).toBe(1000);
    });

    it('Uncheck all clears the selection', () => {
      bootRows(); click('.payment-queue__check-all'); click('.payment-queue__uncheck-all');
      expect(component.selected.size).toBe(0);
    });

    it('toggling a checkbox selects and unselects one row', () => {
      bootRows();
      const box = () => el().querySelector('tbody input[type=checkbox]') as HTMLInputElement;
      box().click(); fixture.detectChanges();
      expect(component.selected.size).toBe(1);
      box().click(); fixture.detectChanges();
      expect(component.selected.size).toBe(0);
    });

    it('Confirm selected is disabled with nothing selected', () => {
      bootRows();
      expect((el().querySelector('.payment-queue__confirm') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('Confirm selected opens the inline prompt and sends nothing yet', () => {
      const spy = spyOn(window, 'confirm');
      openPrompt();
      expect(el().querySelector('.payment-queue__prompt')).not.toBeNull();
      http.expectNone('/api/admin/payments/confirm');
      expect(spy).not.toHaveBeenCalled();
    });

    it('Back closes the prompt and keeps the selection', () => {
      openPrompt(); click('.payment-queue__back');
      expect(el().querySelector('.payment-queue__prompt')).toBeNull();
      expect(component.selected.size).toBe(3);
    });

    it('confirming posts every selected item and on success shows the banner, clears the selection and reloads', () => {
      let changed = 0; component.changed.subscribe(() => changed++);
      openPrompt(); click('.payment-queue__yes');
      const r = confirmReq();
      expect(r.request.body.items).toEqual([
        { bookingId: 'b1', installmentNumber: 1 }, { bookingId: 'b2', installmentNumber: 1 }, { bookingId: 'b3', installmentNumber: 2 }]);
      r.flush([]);
      reload(pageOf([row('b9', 1)]));
      expect(component.banner!.msg.key).toBe('admin.bookingsEmi.ok.confirmedMany');
      expect(el().textContent).toContain('admin.bookingsEmi.ok.confirmedMany');
      expect(component.selected.size).toBe(0);
      expect(changed).toBe(1);
    });

    it('reports how many bookings auto-confirmed', () => {
      openPrompt(); click('.payment-queue__yes');
      confirmReq().flush([{ id: 'b1', status: 'CONFIRMED' }, { id: 'b2', status: 'ACTIVE' }]);
      reload();
      expect(component.banner!.msg.key).toBe('admin.bookingsEmi.ok.confirmedManyAuto');
      expect(component.banner!.msg.params).toEqual({ count: 3, auto: 1 });
    });

    it('locks checkboxes, buttons, filters, pager while the write is in flight', () => {
      openPrompt(); click('.payment-queue__yes');
      const yes = el().querySelector('.payment-queue__yes') as HTMLButtonElement;
      expect(yes.disabled).toBeTrue();
      expect(yes.getAttribute('aria-busy')).toBe('true');
      el().querySelectorAll('input[type=checkbox]').forEach(c => expect((c as HTMLInputElement).disabled).toBeTrue());
      expect(filters().locked).toBeTrue();
      expect(pager().disabled).toBeTrue();
      component.doConfirm(); // second click: no second request (expectOne below would fail)
      confirmReq().flush([]);
      reload();
    });

    it('409 shows the danger banner with the server-named offender, reloads, and reports nothing confirmed', () => {
      openPrompt(); click('.payment-queue__yes');
      confirmReq().flush({ error: 'Installment 1 of booking b2 has no entered payment to confirm' }, { status: 409, statusText: 'Conflict' });
      reload();
      expect(component.banner!.tone).toBe('danger');
      expect(component.banner!.msg.key).toBe('admin.bookingsEmi.err.confirmMany');
      expect(component.banner!.serverText).toContain('booking b2');
      expect(el().textContent).toContain('admin.bookingsEmi.err.serverSaid');
      expect(el().textContent).not.toContain('ok.confirmedMany');
    });

    it('network error says the outcome is unknown, reloads the list, and does not show success', () => {
      openPrompt(); click('.payment-queue__yes');
      confirmReq().error(new ProgressEvent('error'));
      reload();
      expect(component.banner!.tone).toBe('danger');
      expect(component.banner!.msg.key).toBe('admin.bookingsEmi.err.confirmManyNetwork');
    });

    it('selection is cleared by a page change', () => {
      boot(pageOf(rows3(), { totalElements: 45 })); click('.payment-queue__check-all');
      pager().pageChange.emit(1);
      reload(pageOf(rows3(), { page: 1, totalElements: 45 }));
      expect(component.selected.size).toBe(0);
    });

    it('selection is cleared by a filter change', () => {
      bootRows(); click('.payment-queue__check-all');
      filters().filtersChange.emit({ from: '', to: '', projectId: 'p1' });
      reload(pageOf(rows3()));
      expect(component.selected.size).toBe(0);
    });

    it('selection is cleared by Retry/reload', () => {
      bootRows(); click('.payment-queue__check-all');
      component.reload();
      reload(pageOf(rows3()));
      expect(component.selected.size).toBe(0);
    });

    it('rows that disappeared after a reload cannot stay selected', () => {
      bootRows(); click('.payment-queue__check-all');
      component.reload();
      reload(pageOf([row('b1', 1)]));
      expect((el().querySelector('.payment-queue__confirm') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('checkboxes are disabled while a reload is in flight and a key checked then is dropped when the response lands', () => {
      bootRows(); click('.payment-queue__check-all');
      component.reload(); fixture.detectChanges();
      el().querySelectorAll('tbody input[type=checkbox]').forEach(c => expect((c as HTMLInputElement).disabled).toBeTrue());
      component.selected.add('b1#1'); // simulates a check that slipped into the window
      reload(pageOf(rows3()));
      expect(component.selected.size).toBe(0);
    });

    it('renders the pending-total note in the seal caption', () => {
      bootRows();
      expect(el().querySelector('app-seal-card')!.textContent).toContain('admin.bookingsEmi.queue.note');
    });

    it('moves focus to Back when the prompt opens and back to Confirm selected on Back', () => {
      openPrompt();
      expect(document.activeElement).toBe(el().querySelector('.payment-queue__back'));
      click('.payment-queue__back');
      expect(document.activeElement).toBe(el().querySelector('.payment-queue__confirm'));
      const labelled = (el().querySelector('.payment-queue__prompt') as HTMLElement | null);
      expect(labelled).toBeNull();
    });

    it('prompt aria-labelledby points at an existing element', () => {
      openPrompt();
      const id = el().querySelector('.payment-queue__prompt')!.getAttribute('aria-labelledby')!;
      expect(el().querySelector('#' + id)).not.toBeNull();
    });

    it('an empty page past the end reloads the last valid page instead of showing the empty state', () => {
      boot(pageOf(rows3(), { totalElements: 41 }));
      pager().pageChange.emit(2);
      listReq().flush(pageOf([], { page: 2, totalElements: 20 }));
      const r = listReq();
      expect(r.request.params.get('page')).toBe('0');
      r.flush(pageOf(rows3(), { totalElements: 20 }));
      fixture.detectChanges();
      expect(el().querySelectorAll('tbody tr').length).toBe(3);
      expect(el().textContent).not.toContain('empty.queueTitle');
    });
  });
  describe('singular / plural copy', () => {
    const click = (sel: string) => { (el().querySelector(sel) as HTMLButtonElement).click(); fixture.detectChanges(); };
    const k = 'admin.bookingsEmi.';

    it('hides the seal card at 0 payments', () => {
      boot(pageOf([]));
      expect(el().querySelector('app-seal-card')).toBeNull();
    });

    [[1, 'sealCaptionOne', 'sealCaption'], [2, 'sealCaption', 'sealCaptionOne']].forEach(([n, want, not]) => {
      it(`seal caption uses ${want} for ${n} pending`, () => {
        boot(pageOf(Array.from({ length: n as number }, (_, i) => row('b' + i, 1))));
        const t = el().querySelector('app-seal-card')!.textContent!;
        expect(t).toContain(k + 'queue.' + want);
        expect(t).not.toMatch(new RegExp(`queue\\.${not}(?!\\w)`));
      });
    });

    [[1, 'promptOne', 'yesOne', 'confirmedOne', 'confirmedOneAuto'], [2, 'prompt', 'yes', 'confirmedMany', 'confirmedManyAuto']].forEach(([n, prompt, yes, ok, okAuto]) => {
      describe(`${n} selected`, () => {
        const open = () => {
          boot(pageOf(Array.from({ length: n as number }, (_, i) => row('b' + i, 1))));
          click('.payment-queue__check-all'); click('.payment-queue__confirm');
        };
        it('prompt and confirm button use the matching keys', () => {
          open();
          expect(el().querySelector('#payment-queue-prompt')!.textContent).toBe(k + 'queue.' + prompt);
          expect(el().querySelector('.payment-queue__yes')!.textContent!.trim()).toBe(k + 'queue.' + yes);
        });
        it('success banner uses the matching key', () => {
          open(); click('.payment-queue__yes');
          confirmReq().flush([]);
          listReq().flush(pageOf([])); fixture.detectChanges();
          expect(component.banner!.msg.key).toBe(k + 'ok.' + ok);
        });
        it('auto-confirm banner uses the matching key', () => {
          open(); click('.payment-queue__yes');
          confirmReq().flush([{ id: 'b0', status: 'CONFIRMED' }]);
          listReq().flush(pageOf([])); fixture.detectChanges();
          expect(component.banner!.msg.key).toBe(k + 'ok.' + okAuto);
        });
      });
    });
  });
});
