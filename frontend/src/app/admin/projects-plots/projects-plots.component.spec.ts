import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsPlotsComponent } from './projects-plots.component';

describe('ProjectsPlotsComponent', () => {
  let fixture: ComponentFixture<ProjectsPlotsComponent>;
  let http: HttpTestingController;

  const project = (over: Record<string, unknown> = {}) => ({
    id: 'p1', name: 'Green Valley', location: 'Hyderabad', hasThumbnail: false,
    totalPlots: 3, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01T00:00:00Z', ...over
  });
  const cell = (plotNo: string, status = 'AVAILABLE', over: Record<string, unknown> = {}) =>
    ({ plotId: 'id-' + plotNo, plotNo, type: 'NORMAL', area: 1200, price: 4500000, status, ...over });
  const associates = [
    { id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true },
    { id: 'adm', userId: 'ADMIN', name: 'Boss', role: 'ADMIN', hasFreeSlot: false }
  ];
  const el = () => fixture.nativeElement as HTMLElement;

  // Initial burst: associates, EMI config, projects; then the first project's grid.
  function boot(projects: unknown[] = [project()], grid: unknown[] = [cell('A-2'), cell('A-1', 'BOOKED'), cell('B-1', 'SOLD')]) {
    http.expectOne('/api/associates').flush(associates);
    http.expectOne('/api/company/booking-emi').flush({ emiEnabled: true, defaultInstallmentCount: 4 });
    http.expectOne('/api/company/projects').flush(projects);
    if (projects.length) {
      http.expectOne('/api/projects/p1/plots/grid').flush(grid);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectsPlotsComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(ProjectsPlotsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('lists projects and loads the first project grid, grouped into blocks in natural order', () => {
    boot();
    expect(el().textContent).toContain('Green Valley');
    const blocks = el().querySelectorAll('.projects-plots__block');
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelectorAll('app-plot-tile')[0].textContent).toContain('A-1');
  });

  it('shows the no-projects empty state and hides the list', () => {
    boot([]);
    expect(el().textContent).toContain('admin.projectsPlots.empty.noProjectsTitle');
    expect(el().querySelector('.projects-plots__list')).toBeNull();
  });

  it('shows the empty-project state for a project with zero plots', () => {
    boot([project({ totalPlots: 0, availablePlots: 0, soldPlots: 0 })], []);
    expect(el().textContent).toContain('admin.projectsPlots.empty.noPlotsTitle');
  });

  it('legend counts match the tiles and a chip filters the grid by status', () => {
    boot();
    const chips = el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip');
    expect(chips[0].textContent).toContain('1');
    chips[1].click(); // BOOKED
    fixture.detectChanges();
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    const tiles = el().querySelectorAll('app-plot-tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('A-1');
  });

  it('shows the filter-empty message when the chosen status has no plots', () => {
    boot([project()], [cell('A-1')]);
    el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip')[2].click(); // SOLD
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.empty.filter');
  });

  it('selecting a plot fetches its rate and shows the detail aside', () => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    const req = http.expectOne('/api/company/projects/p1/plots/id-A-1');
    req.flush({ id: 'id-A-1', plotNo: 'A-1', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'BOOKED' });
    fixture.detectChanges();
    const aside = el().querySelector('.projects-plots__aside')!;
    expect(aside.textContent).toContain('A-1');
    expect(aside.textContent).toContain('3,750');
  });

  it('keeps the last good grid and shows a Retry banner when a refresh fails', () => {
    boot();
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(3);
    expect(el().textContent).toContain('admin.projectsPlots.error.loadGrid');
    expect(el().querySelector('.projects-plots__retry')).not.toBeNull();
  });

  it('switching project resets the selected plot and aside', () => {
    boot([project(), project({ id: 'p2', name: 'Lake View' })]);
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    http.expectOne('/api/company/projects/p1/plots/id-A-1').flush({ rate: 1 });
    fixture.componentInstance.selectProject(fixture.componentInstance.projects![1]);
    http.expectOne('/api/projects/p2/plots/grid').flush([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.aside.kind).toBe('none');
    expect(fixture.componentInstance.selectedPlot).toBeNull();
  });
});
