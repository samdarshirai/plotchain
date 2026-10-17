import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BookingRegisterComponent } from './booking-register.component';
import { OverdueReportComponent } from './overdue-report.component';
import { PaymentQueueComponent } from './payment-queue.component';
import { PaymentLedgerComponent } from './payment-ledger.component';
import { CancelledBookingsComponent } from './cancelled-bookings.component';
import { LastEmiComponent } from './last-emi.component';
import { BookingsEmiService } from './bookings-emi.service';
import { BookingEmiConfig, FlashMessage } from './bookings-emi.model';

type Tab = 'register' | 'unconfirmed' | 'confirmed' | 'overdue' | 'cancelled' | 'lastEmi';
const TABS: Tab[] = ['register', 'unconfirmed', 'confirmed', 'overdue', 'cancelled', 'lastEmi'];

@Component({
  selector: 'app-bookings-emi',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./bookings-emi.component.scss'],
  imports: [CommonModule, TranslateModule, TabBarComponent, InlineBannerComponent, BookingRegisterComponent, OverdueReportComponent,
    PaymentQueueComponent, PaymentLedgerComponent, CancelledBookingsComponent, LastEmiComponent],
  template: `
    <div class="bookings-emi">
      <div class="bookings-emi__head">
        <div class="bookings-emi__intro">
          <span class="bookings-emi__eyebrow">{{ 'admin.bookingsEmi.eyebrow' | translate }}</span>
          <h1 class="bookings-emi__title">{{ 'admin.bookingsEmi.title' | translate }}</h1>
          <p class="bookings-emi__subtitle">{{ 'admin.bookingsEmi.subtitle' | translate }}</p>
        </div>
        <span class="bookings-emi__rule" *ngIf="rulePill as r">{{ r.key | translate: r.params }}</span>
      </div>
      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = null">
        <span role="status">{{ flash.key | translate: flash.params }}</span>
      </app-inline-banner>
      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="selectTab($any($event))"></app-tab-bar>
      <app-inline-banner *ngIf="actionHint && activeTab === 'register'" tone="info">{{ 'admin.bookingsEmi.hint.' + actionHint | translate }}</app-inline-banner>
      <app-booking-register *ngIf="activeTab === 'register'" [config]="config" [focusBookingId]="focusBookingId"
        (flash)="flash = $event" (changed)="loadOverdueTotal()"></app-booking-register>
      <app-overdue-report *ngIf="activeTab === 'overdue'" (openBooking)="openFromOverdue($event)" (total)="overdueTotal = $event"></app-overdue-report>
      <app-payment-queue *ngIf="activeTab === 'unconfirmed'"></app-payment-queue>
      <app-payment-ledger *ngIf="activeTab === 'confirmed'"></app-payment-ledger>
      <app-cancelled-bookings *ngIf="activeTab === 'cancelled'"></app-cancelled-bookings>
      <app-last-emi *ngIf="activeTab === 'lastEmi'"></app-last-emi>
    </div>
  `
})
export class BookingsEmiComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  activeTab: Tab = 'register';
  actionHint: 'reschedule' | 'transfer' | null = null;
  config: BookingEmiConfig | null = null;
  flash: FlashMessage | null = null;
  overdueTotal: number | null = null;
  focusBookingId: string | null = null;

  get rulePill(): { key: string; params?: Record<string, unknown> } | null {
    const c = this.config;
    if (!c || !c.emiEnabled) { return null; }
    return c.confirmRule === 'AUTO_THRESHOLD' && c.confirmThresholdPercent != null
      ? { key: 'admin.bookingsEmi.rule.auto', params: { percent: c.confirmThresholdPercent } }
      : c.confirmRule === 'MANUAL' ? { key: 'admin.bookingsEmi.rule.manual' } : null;
  }
  get tabs(): TabDefinition[] {
    const od = this.overdueTotal == null ? '' : ` (${this.overdueTotal})`;
    return [
      { id: 'register', label: this.translate.instant('admin.bookingsEmi.tab.register') },
      { id: 'unconfirmed', label: this.translate.instant('admin.bookingsEmi.tab.unconfirmed') },
      { id: 'confirmed', label: this.translate.instant('admin.bookingsEmi.tab.confirmed') },
      { id: 'overdue', label: this.translate.instant('admin.bookingsEmi.tab.overdue') + od },
      { id: 'cancelled', label: this.translate.instant('admin.bookingsEmi.tab.cancelled') },
      { id: 'lastEmi', label: this.translate.instant('admin.bookingsEmi.tab.lastEmi') }
    ];
  }
  ngOnInit(): void {
    // Config unreadable hides the pill and the auto-confirm warnings; never guess a rule. emiEnabled only hides the pill (the backend threshold ignores it).
    this.service.config().subscribe({ next: c => (this.config = c), error: () => (this.config = null) });
    this.loadOverdueTotal();
    // unit 11 banner link: /settings/bookings-emi?booking=<id>
    // Sidebar items deep-link here: ?tab= picks the tab, ?action= shows a "pick a booking first" hint.
    this.route.queryParamMap.subscribe(q => {
      const tab = q.get('tab') as Tab | null;
      if (tab && TABS.includes(tab)) { this.activeTab = tab; }
      const action = q.get('action');
      this.actionHint = action === 'reschedule' || action === 'transfer' ? action : null;
      const id = q.get('booking');
      if (id) { this.openBooking(id); }
    });
  }
  // The URL is the source of truth so the sidebar item for this tab lights up.
  selectTab(tab: Tab): void {
    this.flash = null;
    this.activeTab = tab;
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab, action: null, booking: null }, queryParamsHandling: 'merge' });
  }
  loadOverdueTotal(): void {
    this.service.overdue(0, 1).subscribe({ next: r => (this.overdueTotal = r.totalElements), error: () => (this.overdueTotal = null) });
  }
  openFromOverdue(bookingId: string): void { this.openBooking(bookingId); }
  private openBooking(id: string): void {
    this.focusBookingId = id;
    this.activeTab = 'register';
  }
}
