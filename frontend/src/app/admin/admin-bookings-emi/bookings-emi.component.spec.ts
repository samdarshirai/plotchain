import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BookingsEmiComponent } from './bookings-emi.component';
import { BookingRegisterComponent } from './booking-register.component';
import { TabBarComponent } from '../../shared/components/tab-bar/tab-bar.component';

describe('BookingsEmiComponent', () => {
  let fixture: ComponentFixture<BookingsEmiComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const cfg = (over: Record<string, unknown> = {}) => ({
    emiEnabled: true, defaultInstallmentCount: 4, confirmRule: 'AUTO_THRESHOLD', confirmThresholdPercent: 30, updatedAt: '2026-01-01T00:00:00Z', ...over
  });
  const od = (total = 7) => ({ rows: [], page: 0, size: 1, totalElements: total });
  const sizeOneReqs = () => http.match(r => r.url === '/api/admin/emi-reports/overdue' && r.params.get('size') === '1');
  const flushRegister = () => {
    http.expectOne('/api/associates').flush([]);
    http.expectOne('/api/company/projects').flush([]);
    http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
  };

  function boot(opts: { config?: unknown; configFail?: boolean; overdueFail?: boolean; overdueTotal?: number } = {}) {
    const c = http.expectOne('/api/company/booking-emi');
    if (opts.configFail) { c.flush('boom', { status: 500, statusText: 'err' }); } else { c.flush(opts.config ?? cfg()); }
    const o = sizeOneReqs();
    expect(o.length).toBe(1);
    if (opts.overdueFail) { o[0].flush('boom', { status: 500, statusText: 'err' }); } else { o[0].flush(od(opts.overdueTotal ?? 7)); }
    flushRegister();
    fixture.detectChanges();
  }
  const register = () => fixture.debugElement.query(By.directive(BookingRegisterComponent));
  const pill = () => el().querySelector('.bookings-emi__rule');
  const switchTab = (id: string) => {
    fixture.debugElement.query(By.directive(TabBarComponent)).componentInstance.tabChange.emit(id);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingsEmiComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(BookingsEmiComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('shows the Auto-at-% pill for AUTO_THRESHOLD and the Manual pill for MANUAL', () => {
    boot();
    expect(pill()!.textContent).toContain('admin.bookingsEmi.rule.auto');
    expect(fixture.componentInstance.rulePill).toEqual({ key: 'admin.bookingsEmi.rule.auto', params: { percent: 30 } });
    expect(register().componentInstance.config.confirmRule).toBe('AUTO_THRESHOLD');

    // MANUAL on a fresh instance
    fixture.destroy();
    fixture = TestBed.createComponent(BookingsEmiComponent);
    fixture.detectChanges();
    boot({ config: cfg({ confirmRule: 'MANUAL', confirmThresholdPercent: null }) });
    expect(pill()!.textContent).toContain('admin.bookingsEmi.rule.manual');
    expect(pill()!.textContent).not.toContain('rule.auto');
  });

  it('passes the real config but shows no pill when emiEnabled is false', () => {
    boot({ config: cfg({ emiEnabled: false }) });
    expect(pill()).toBeNull();
    expect(fixture.componentInstance.config!.confirmRule).toBe('AUTO_THRESHOLD');
    expect(register().componentInstance.config.emiEnabled).toBeFalse();
    expect(register().componentInstance.config.confirmThresholdPercent).toBe(30);
  });

  it('hides the pill when the config call fails (does not guess)', () => {
    boot({ configFail: true });
    expect(pill()).toBeNull();
    expect(fixture.componentInstance.config).toBeNull();
    expect(register().componentInstance.config).toBeNull();
  });

  it('shows the overdue count on the tab from a size=1 report call, and hides it when that call fails', () => {
    boot();
    expect(fixture.componentInstance.overdueTotal).toBe(7);
    expect(fixture.componentInstance.tabs[1].label.endsWith(' (7)')).toBeTrue();
    expect(fixture.componentInstance.tabs[0].label).not.toContain('(');
    expect(el().querySelector('app-tab-bar')!.textContent).toContain('7');

    fixture.destroy();
    fixture = TestBed.createComponent(BookingsEmiComponent);
    fixture.detectChanges();
    boot({ overdueFail: true });
    expect(fixture.componentInstance.overdueTotal).toBeNull();
    expect(fixture.componentInstance.tabs[1].label).not.toContain('(');
    expect(el().querySelector('app-tab-bar')!.textContent).not.toMatch(/\(\d+\)/);
  });

  it('switching to Overdue mounts the report; switching back remounts the register', () => {
    boot();
    expect(fixture.componentInstance.activeTab).toBe('register');
    expect(el().querySelector('app-booking-register')).not.toBeNull();
    expect(el().querySelector('app-overdue-report')).toBeNull();

    switchTab('overdue');
    expect(fixture.componentInstance.activeTab).toBe('overdue');
    expect(el().querySelector('app-booking-register')).toBeNull();
    expect(el().querySelector('app-overdue-report')).not.toBeNull();
    http.expectOne(r => r.url === '/api/admin/emi-reports/overdue' && r.params.get('size') === '20').flush({ rows: [], page: 0, size: 20, totalElements: 9 });
    fixture.detectChanges();
    expect(fixture.componentInstance.overdueTotal).toBe(9);

    switchTab('register');
    expect(fixture.componentInstance.activeTab).toBe('register');
    expect(el().querySelector('app-overdue-report')).toBeNull();
    expect(el().querySelector('app-booking-register')).not.toBeNull();
    flushRegister();
  });

  it('opening a booking from the overdue tab switches to the register focused on it', () => {
    boot();
    switchTab('overdue');
    http.expectOne(r => r.url === '/api/admin/emi-reports/overdue' && r.params.get('size') === '20').flush({ rows: [], page: 0, size: 20, totalElements: 9 });
    fixture.componentInstance.openFromOverdue('b9');
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab).toBe('register');
    expect(register().componentInstance.focusBookingId).toBe('b9');
    http.expectOne('/api/admin/bookings/b9').flush({ id: 'b9', installments: [] });
    flushRegister();
  });

  it('?booking=<id> in the URL focuses that booking in the register', async () => {
    boot();
    await TestBed.inject(Router).navigate([], { queryParams: { booking: 'b7' } });
    fixture.detectChanges();
    expect(register().componentInstance.focusBookingId).toBe('b7');
    http.expectOne('/api/admin/bookings/b7').flush({ id: 'b7', installments: [] });
  });

  it('switching tabs clears the flash', () => {
    boot();
    fixture.componentInstance.flash = { key: 'x' };
    switchTab('overdue');
    expect(fixture.componentInstance.flash).toBeNull();
    http.expectOne(r => r.url === '/api/admin/emi-reports/overdue' && r.params.get('size') === '20').flush({ rows: [], page: 0, size: 20, totalElements: 0 });
  });

  it('a flash from the register shows a dismissible success banner above the tabs', () => {
    boot();
    expect(el().querySelector('app-inline-banner')).toBeNull();
    register().componentInstance.flash.emit({ key: 'admin.bookingsEmi.flash.paid', params: { n: 1 } });
    fixture.detectChanges();
    const banner = fixture.debugElement.query(By.css('app-inline-banner'));
    expect(banner).not.toBeNull();
    expect(banner.componentInstance.tone).toBe('success');
    expect(banner.componentInstance.dismissible).toBeTrue();
    expect(banner.nativeElement.textContent).toContain('admin.bookingsEmi.flash.paid');
    const tabBar = el().querySelector('app-tab-bar')!;
    expect(banner.nativeElement.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    banner.componentInstance.dismissed.emit();
    fixture.detectChanges();
    expect(fixture.componentInstance.flash).toBeNull();
    expect(el().querySelector('app-inline-banner')).toBeNull();
  });

  it('refreshes the overdue count when the register reports a change', () => {
    boot();
    register().componentInstance.changed.emit();
    const reqs = sizeOneReqs();
    expect(reqs.length).toBe(1);
    reqs[0].flush(od(3));
    fixture.detectChanges();
    expect(fixture.componentInstance.overdueTotal).toBe(3);
    expect(fixture.componentInstance.tabs[1].label.endsWith(' (3)')).toBeTrue();
  });
});
