import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AnnouncementService } from './announcement.service';
import { Announcement, AnnouncementPage } from './announcement.model';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-announcement-feed',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="announcement-feed">
      <div class="announcement-feed__intro">
        <span class="announcement-feed__eyebrow">{{ 'announcements.feed.eyebrow' | translate }}</span>
        <h1 class="announcement-feed__title">{{ 'announcements.feed.title' | translate }}</h1>
        <p class="announcement-feed__subtitle">{{ 'announcements.feed.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="announcement-feed__load-error">
        <span role="alert">{{ 'announcements.feed.loadError' | translate }}</span>
        <button type="button" class="announcement-feed__retry" (click)="retry()">{{ 'announcements.feed.retryAction' | translate }}</button>
      </app-inline-banner>

      <div *ngIf="loading" [attr.aria-busy]="true">
        <div role="status">
          <span class="announcement-feed__sr">{{ 'announcements.feed.loading' | translate }}</span>
          <div class="announcement-feed__skeleton-card" *ngFor="let _ of [1, 2, 3]"></div>
        </div>
      </div>

      <ng-container *ngIf="!loading && !loadError && page">
        <div class="announcement-feed__empty" *ngIf="!page.entries.length">
          <p class="announcement-feed__empty-title">{{ 'announcements.feed.emptyTitle' | translate }}</p>
          <p class="announcement-feed__empty-body">{{ 'announcements.feed.emptyBody' | translate }}</p>
        </div>
        <ol class="announcement-feed__list" *ngIf="page.entries.length">
          <li *ngFor="let a of page.entries; trackBy: trackById">
            <article class="announcement-feed__card">
              <!-- default en-US date locale on purpose: months stay English under hi (hi UI strings are English by decision) -->
              <time class="announcement-feed__dateline" [attr.datetime]="a.publishedAt">
                <span class="announcement-feed__day">{{ a.publishedAt | date: 'd' }}</span>
                <span class="announcement-feed__month">{{ a.publishedAt | date: 'MMM' }}</span>
                <span class="announcement-feed__year">{{ a.publishedAt | date: 'y' }}</span>
              </time>
              <div class="announcement-feed__content">
                <h2 class="announcement-feed__card-title">{{ a.title }}</h2>
                <p class="announcement-feed__body">{{ a.body }}</p>
              </div>
            </article>
          </li>
        </ol>
      </ng-container>

      <div class="announcement-feed__pagination" *ngIf="page && !loading && !loadError && page.entries.length">
        <span class="announcement-feed__page-indicator">{{ 'announcements.feed.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}</span>
        <button type="button" class="brand-button brand-button--secondary announcement-feed__prev" [attr.aria-disabled]="page.page === 0 ? 'true' : null" (click)="goToPage(page.page - 1)">{{ 'announcements.feed.previousPageAction' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary announcement-feed__next" [attr.aria-disabled]="(page.page + 1) * page.size >= page.totalElements ? 'true' : null" (click)="goToPage(page.page + 1)">{{ 'announcements.feed.nextPageAction' | translate }}</button>
      </div>
    </div>
  `
})
export class AnnouncementFeedComponent implements OnInit, OnDestroy {
  private service = inject(AnnouncementService);
  private destroyed$ = new Subject<void>();
  private seq = 0; // latest-request-wins: a slow older response never overwrites a newer one
  private lastPage = 0; // last ATTEMPTED page, so Retry re-requests the page that failed

  page: AnnouncementPage | null = null;
  loading = false;
  loadError = false;

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  trackById = (_: number, a: Announcement) => a.id;

  ngOnInit(): void {
    this.loadPage(0);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  goToPage(page: number): void {
    if (this.loading || page < 0 || (this.page && page * this.page.size >= Math.max(this.page.totalElements, 1))) {
      return; // aria-disabled buttons stay clickable (focus-safe), so enforce bounds and ignore clicks while a load is in flight
    }
    this.loadPage(page);
  }

  retry(): void {
    if (this.loading) {
      return;
    }
    this.loadPage(this.lastPage);
  }

  private loadPage(page: number): void {
    const mine = ++this.seq;
    this.lastPage = page;
    this.loading = true;
    this.loadError = false;
    this.service.list(page, PAGE_SIZE).pipe(takeUntil(this.destroyed$)).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.page = res;
        this.loading = false;
      },
      error: () => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.loadError = true;
      }
    });
  }
}
