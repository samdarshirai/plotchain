import { ActivatedRoute } from '@angular/router';
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BookingRegisterComponent } from './booking-register.component';
import { OverdueReportComponent } from './overdue-report.component';
import { BookingsEmiService } from './bookings-emi.service';
import { BookingEmiConfig, FlashMessage } from './bookings-emi.model';

@Component({
  selector: 'app-bookings-emi',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./bookings-emi.component.scss'],
  imports: [CommonModule, TranslateModule, TabBarComponent, InlineBannerComponent, BookingRegisterComponent, OverdueReportComponent],
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
      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="activeTab = $any($event)"></app-tab-bar>
      <app-booking-register *ngIf="activeTab === 'register'" [config]="config" [focusBookingId]="focusBookingId"
        (flash)="flash = $event" (changed)="loadOverdueTotal()"></app-booking-register>
      <app-overdue-report *ngIf="activeTab === 'overdue'" (openBooking)="openFromOverdue($event)" (total)="overdueTotal = $event"></app-overdue-report>
    </div>
  `
})
export class BookingsEmiComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  activeTab: 'register' | 'overdue' = 'register';
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
      { id: 'overdue', label: this.translate.instant('admin.bookingsEmi.tab.overdue') + od }
    ];
  }
  ngOnInit(): void {
    // Config unreadable hides the pill and the auto-confirm warnings; never guess a rule. emiEnabled only hides the pill (the backend threshold ignores it).
    this.service.config().subscribe({ next: c => (this.config = c), error: () => (this.config = null) });
    this.loadOverdueTotal();
    // unit 11 banner link: /settings/bookings-emi?booking=<id>
    this.route.queryParamMap.subscribe(q => { const id = q.get('booking'); if (id) { this.openBooking(id); } });
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
