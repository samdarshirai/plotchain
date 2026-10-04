import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { PlotAvailabilityComponent } from './plot-availability.component';
import { MyBookingsComponent } from './my-bookings.component';

type Tab = 'availability' | 'myBookings';

// Host only: each tab is its own component and is mounted only while active, so My bookings
// still loads lazily on first open and Availability re-fetches fresh data when returned to
// (the grid is a snapshot; there is no polling).
@Component({
  selector: 'app-plot-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, TabBarComponent, PlotAvailabilityComponent, MyBookingsComponent],
  template: `
    <div class="plot-bookings">
      <h1 class="plot-bookings__title">{{ 'plotBookings.title' | translate }}</h1>
      <p class="plot-bookings__subtitle">{{ 'plotBookings.subtitle' | translate }}</p>
      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="onTabChange($event)"></app-tab-bar>
      <app-plot-availability *ngIf="activeTab === 'availability'"></app-plot-availability>
      <app-my-bookings *ngIf="activeTab === 'myBookings'" (viewAvailability)="onTabChange('availability')"></app-my-bookings>
    </div>
  `
})
export class PlotBookingsComponent {
  private translate = inject(TranslateService);
  activeTab: Tab = 'availability';

  get tabs(): TabDefinition[] {
    return [
      { id: 'availability', label: this.translate.instant('plotBookings.tabAvailability') },
      { id: 'myBookings', label: this.translate.instant('plotBookings.tabMyBookings') }
    ];
  }

  onTabChange(tabId: string): void {
    this.activeTab = tabId as Tab;
  }
}
