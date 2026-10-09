import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { Announcement, AnnouncementPage } from '../../announcements/announcement.model';
import { AnnouncementService } from '../../announcements/announcement.service';
import { AnnouncementComposeFormComponent } from './announcement-compose-form.component';
import { FlashMessage, bodyNeedsToggle } from './admin-announcements.util';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-admin-announcements',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./admin-announcements.component.scss', './admin-announcements-list.scss', './admin-announcements-items.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, AnnouncementComposeFormComponent],
  template: `
    <main class="announcement-composer">
      <header>
        <span class="announcement-composer__eyebrow">{{ 'announcements.composer.eyebrow' | translate }}</span>
        <h1 class="announcement-composer__title">{{ 'announcements.composer.title' | translate }}</h1>
        <p class="announcement-composer__subtitle">{{ 'announcements.composer.subtitle' | translate }}</p>
      </header>

      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = null">
        <span role="status">{{ flash.key | translate: flash.params }}</span>
      </app-inline-banner>

      <div class="announcement-composer__grid">
        <app-announcement-compose-form (published)="onPublished($event)" (busyChange)="onBusy($event)"></app-announcement-compose-form>

        <section class="announcement-composer__list-wrap" [attr.aria-label]="'announcements.composer.list.heading' | translate">
          <div class="announcement-composer__list" [attr.aria-busy]="loading">
            <div class="announcement-composer__list-head">
              <h2>{{ 'announcements.composer.list.heading' | translate }}</h2>
              <span class="announcement-composer__count" aria-live="polite">
                <ng-container *ngIf="page; else loadingCount">{{ (page.totalElements === 1 ? 'announcements.composer.list.countOne' : 'announcements.composer.list.count') | translate: { count: page.totalElements } }}</ng-container>
                <ng-template #loadingCount>{{ 'announcements.composer.list.loadingCount' | translate }}</ng-template>
              </span>
            </div>

            <app-inline-banner *ngIf="loadError" tone="danger">
              <span role="alert">{{ 'announcements.composer.err.load' | translate }}</span>
              <button type="button" class="announcement-composer__retry" [attr.aria-disabled]="locked ? 'true' : null" (click)="reload()">{{ 'announcements.composer.err.retry' | translate }}</button>
            </app-inline-banner>

            <div class="announcement-composer__skeleton" role="status" *ngIf="!page && !loadError">
              <span class="announcement-composer__sr">{{ 'announcements.composer.list.loading' | translate }}</span>
              <span class="announcement-composer__skeleton-row" *ngFor="let i of [1,2,3]"></span>
            </div>

            <div class="announcement-composer__empty" *ngIf="page && !page.entries.length">
              <span class="material-symbols-outlined" aria-hidden="true">campaign</span>
              <h3>{{ 'announcements.composer.list.empty.title' | translate }}</h3>
              <p>{{ 'announcements.composer.list.empty.body' | translate }}</p>
            </div>

            <ul class="announcement-composer__items" *ngIf="page?.entries?.length">
              <li *ngFor="let a of page!.entries; trackBy: trackById" class="announcement-composer__item" [class.announcement-composer__item--new]="a.id === justPublishedId">
                <div class="announcement-composer__date">
                  <span class="announcement-composer__day">{{ a.publishedAt | date: 'dd' }}</span>
                  <span class="announcement-composer__mon">{{ a.publishedAt | date: 'MMM y' }}</span>
                </div>
                <div>
                  <div class="announcement-composer__item-head">
                    <h3 class="announcement-composer__item-title">{{ a.title }}</h3>
                    <span class="announcement-composer__chip" *ngIf="a.id === justPublishedId">{{ 'announcements.composer.list.justPublished' | translate }}</span>
                  </div>
                  <p class="announcement-composer__body" [class.is-open]="isOpen(a.id)" [id]="'announcement-body-' + a.id">{{ a.body }}</p>
                  <button type="button" class="announcement-composer__more" *ngIf="needsToggle(a)" [attr.aria-expanded]="isOpen(a.id)" [attr.aria-controls]="'announcement-body-' + a.id" (click)="toggle(a.id)">{{ (isOpen(a.id) ? 'announcements.composer.list.showLess' : 'announcements.composer.list.showFull') | translate }}</button>
                  <p class="announcement-composer__time">{{ 'announcements.composer.list.published' | translate: { date: (a.publishedAt | date: 'd MMM y, HH:mm') } }}</p>
                </div>
              </li>
            </ul>

            <nav class="announcement-composer__pager" *ngIf="page?.entries?.length" [attr.aria-label]="'announcements.composer.list.pagination' | translate">
              <button type="button" class="brand-button brand-button--secondary announcement-composer__prev" [attr.aria-disabled]="pagerOff || page!.page === 0 ? 'true' : null" (click)="goTo(page!.page - 1)">{{ 'announcements.composer.list.previous' | translate }}</button>
              <span class="announcement-composer__page">{{ 'announcements.composer.list.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
              <button type="button" class="brand-button brand-button--secondary announcement-composer__next" [attr.aria-disabled]="pagerOff || page!.page + 1 >= totalPages ? 'true' : null" (click)="goTo(page!.page + 1)">{{ 'announcements.composer.list.next' | translate }}</button>
            </nav>
          </div>
        </section>
      </div>
    </main>
  `
})
export class AdminAnnouncementsComponent implements OnInit {
  private service = inject(AnnouncementService);

  page: AnnouncementPage | null = null;
  loading = false;
  loadError = false;
  locked = false; // true while the form's publish is in flight: pager and Retry freeze
  flash: FlashMessage | null = null;
  justPublishedId: string | null = null;
  private seq = 0;
  private currentPage = 0;
  private open = new Set<string>();

  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }
  get pagerOff(): boolean { return this.locked || this.loading; }
  trackById = (_: number, a: Announcement) => a.id;
  isOpen = (id: string) => this.open.has(id);
  needsToggle = (a: Announcement) => bodyNeedsToggle(a.body);

  ngOnInit(): void { this.reload(); }

  reload(): void { if (!this.locked) { this.load(this.currentPage); } }

  // aria-disabled buttons stay clickable, so every guard lives here, not on the button.
  goTo(p: number): void {
    if (this.pagerOff || p < 0 || p >= this.totalPages) { return; }
    this.justPublishedId = null;
    this.load(p);
  }

  toggle(id: string): void { this.open.has(id) ? this.open.delete(id) : this.open.add(id); }

  onBusy(busy: boolean): void {
    this.locked = busy;
    if (busy) { this.flash = null; }
  }

  // Publish finished: announce it, mark it, and re-read page 0 (newest-first). This also retries a failed list load.
  onPublished(created: Announcement): void {
    this.flash = { key: 'announcements.composer.ok.published', params: { title: created.title } };
    this.justPublishedId = created.id;
    this.load(0);
  }

  // Latest-request-wins: a slow earlier response can never overwrite a newer one.
  private load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.list(p, PAGE_SIZE).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.page = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
