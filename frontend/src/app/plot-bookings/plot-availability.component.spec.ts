import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotAvailabilityComponent } from './plot-availability.component';

describe('PlotAvailabilityComponent', () => {
  let fixture: ComponentFixture<PlotAvailabilityComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  const project = (id: string, name = 'Green Valley') =>
    ({ id, name, location: 'Hyderabad', hasThumbnail: false, totalPlots: 3, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01T00:00:00Z' });
  const cell = (plotNo: string, status = 'AVAILABLE', type = 'NORMAL', over: Record<string, unknown> = {}) =>
    ({ plotId: 'id-' + plotNo, plotNo, type, area: 1200, price: 4500000, status, ...over });

  function boot(projects: unknown[] = [project('p1')], grid: unknown[] = [cell('A-2'), cell('A-1', 'BOOKED', 'CORNER'), cell('B-1', 'SOLD')]) {
    http.expectOne('/api/company/projects').flush(projects);
    if (projects.length) { http.expectOne('/api/projects/p1/plots/grid').flush(grid); }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlotAvailabilityComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PlotAvailabilityComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('auto-selects the first project and renders its grid in natural block order', () => {
    boot();
    const blocks = el().querySelectorAll('.plot-availability__block');
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelectorAll('app-plot-tile')[0].textContent).toContain('A-1');
  });

  it('shows the seal figure from AVAILABLE rows only', () => {
    boot();
    expect(fixture.componentInstance.counts.AVAILABLE).toBe(1);
    expect(el().querySelector('.plot-availability__seal')!.textContent).toContain('plotBookings.seal.figure');
  });

  it('single-select status chips filter the grid and the shown-count', () => {
    boot();
    const chips = el().querySelectorAll<HTMLButtonElement>('.plot-availability__chip');
    chips[2].click(); // ALL, AVAILABLE, BOOKED, SOLD
    fixture.detectChanges();
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
    expect(el().querySelector('[aria-live="polite"]')!.textContent).toContain('plotBookings.shownCount');
  });

  it('filters by plot type', () => {
    boot();
    fixture.componentInstance.setType('CORNER');
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
  });

  it('shows no-match with a working Clear filters when filters leave nothing', () => {
    boot([project('p1')], [cell('A-1')]);
    fixture.componentInstance.setStatus('SOLD');
    fixture.detectChanges();
    expect(el().textContent).toContain('plotBookings.noMatchTitle');
    el().querySelector<HTMLButtonElement>('.plot-availability__clear')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
  });

  it('shows the empty-project state for a project with no plots', () => {
    boot([project('p1')], []);
    expect(el().textContent).toContain('plotBookings.plotsEmptyTitle');
  });

  it('shows the projects error banner and Retry reloads', () => {
    http.expectOne('/api/company/projects').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('plotBookings.projectsLoadError');
    el().querySelector<HTMLButtonElement>('.plot-availability__retry')!.click();
    http.expectOne('/api/company/projects').flush([]);
  });

  it('keeps the last grid and shows a stale banner when a refresh fails', () => {
    boot();
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(3);
    expect(el().textContent).toContain('plotBookings.plotsRefreshError');
  });

  it('switching project clears filters, closes the popover, and ignores a late response for the old project', () => {
    boot([project('p1'), project('p2', 'Lake View')]);
    fixture.componentInstance.setStatus('BOOKED');
    fixture.componentInstance.openPopover(fixture.componentInstance.grid![0]);
    fixture.componentInstance.loadGrid();               // slow p1 refresh in flight
    const stale = http.expectOne('/api/projects/p1/plots/grid');
    fixture.componentInstance.selectProject('p2');
    http.expectOne('/api/projects/p2/plots/grid').flush([cell('Z-1')]);
    stale.flush([cell('OLD-1')]);                       // arrives late
    fixture.detectChanges();
    expect(fixture.componentInstance.statusFilter).toBe('ALL');
    expect(fixture.componentInstance.typeFilter).toBe('ALL');
    expect(fixture.componentInstance.selected).toBeNull();
    expect(el().querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.componentInstance.grid!.map(g => g.plotNo)).toEqual(['Z-1']);
  });

  it('opens a read-only popover with exact price and nothing about buyers or bookings', () => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    fixture.detectChanges();
    const dialog = el().querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('₹45,00,000');
    expect(dialog.textContent).toContain('plotBookings.popover.hint');
    expect(dialog.textContent!.toLowerCase()).not.toContain('buyer');
    expect(dialog.querySelectorAll('input, form, textarea').length).toBe(0);
  });

  it('never renders extra grid fields even if the API adds them', () => {
    boot([project('p1')], [cell('A-1', 'BOOKED', 'NORMAL', { buyerName: 'SECRET', associateId: 'LEAK', bookingId: 'BKLEAK', bookedBy: 'BYLEAK' })]);
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    fixture.detectChanges();
    expect(el().textContent).not.toContain('SECRET');
    expect(el().querySelector('[role="dialog"]')).not.toBeNull();
    for (const w of ['SECRET', 'LEAK', 'BKLEAK', 'BYLEAK']) { expect(el().textContent).not.toContain(w); }
  });

  it('closes the popover on Escape and returns focus to the tile', async () => {
    document.body.appendChild(fixture.nativeElement);
    boot();
    const tile = el().querySelector<HTMLButtonElement>('app-plot-tile button')!;
    tile.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    await new Promise(r => setTimeout(r));
    expect(fixture.componentInstance.selected).toBeNull();
    expect(document.activeElement).toBe(tile);
    fixture.nativeElement.remove();
  });

  it('has no write controls on the tab', () => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    fixture.detectChanges();
    expect(el().querySelector('[role="dialog"]')).not.toBeNull();
    el().querySelectorAll('button:not(.plot-availability__chip):not(app-plot-tile button)').forEach(b => expect((b.textContent || '').replace(/plotBookings\./g, '')).not.toMatch(/book|pay|cancel|transfer|edit/i));
    expect(el().querySelectorAll('form, input[type="text"], textarea').length).toBe(0);
  });
});
