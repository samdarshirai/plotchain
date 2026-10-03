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

  it('switching project clears a previous grid-load error and shows the skeleton', () => {
    boot([project(), project({ id: 'p2', name: 'Lake View' })]);
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('boom', { status: 500, statusText: 'err' });
    fixture.componentInstance.selectProject(fixture.componentInstance.projects![1]);
    fixture.detectChanges();
    expect(el().textContent).not.toContain('admin.projectsPlots.error.loadGrid');
    expect(el().querySelector('.projects-plots__skeleton')).not.toBeNull();
    http.expectOne('/api/projects/p2/plots/grid').flush([]);
  });

  it('Add project is usable with zero projects', () => {
    boot([]);
    fixture.componentInstance.openAside({ kind: 'project', mode: 'add' });
    fixture.detectChanges();
    expect(el().querySelector('.projects-plots__aside')).not.toBeNull();
  });

  it('block summary shows whole-block counts while a status filter is active', () => {
    boot([project()], [cell('A-1'), cell('A-2', 'BOOKED'), cell('A-3', 'SOLD')]);
    el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip')[1].click(); // BOOKED
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
    expect(fixture.componentInstance.blockStats['A']).toEqual({ available: 1, total: 3 });
  });

  it('shows a dash when the plot detail has no rate', () => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    http.expectOne('/api/company/projects/p1/plots/id-A-1').flush({ id: 'id-A-1' });
    fixture.detectChanges();
    expect(el().querySelector('.projects-plots__facts')!.textContent).toContain('—');
  });

  describe('plot and project mutations', () => {
    const detail = (over: Record<string, unknown> = {}) =>
      ({ id: 'id-A-2', plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'AVAILABLE', ...over });

    function selectFirstAvailable(status = 'AVAILABLE') {
      const first = fixture.componentInstance.grid!.find(p => p.status === status)!;
      el().querySelectorAll<HTMLButtonElement>('app-plot-tile button')[
        fixture.componentInstance.visibleBlocks.flatMap(b => b.plots).findIndex(p => p.plotId === first.plotId)
      ].click();
      http.expectOne(`/api/company/projects/p1/plots/${first.plotId}`).flush(detail({ id: first.plotId, plotNo: first.plotNo, status }));
      fixture.detectChanges();
    }

    it('offers Edit plot on an AVAILABLE plot and PUTs the change, then refreshes grid and project counts', () => {
      boot();
      selectFirstAvailable();
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      fixture.componentInstance.saveEditedPlot({ plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1300, rate: 3750, price: 4875000, status: 'AVAILABLE' });
      const put = http.expectOne('/api/company/projects/p1/plots/id-A-2');
      expect(put.request.method).toBe('PUT');
      put.flush(detail({ areaSqft: 1300 }));
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail({ areaSqft: 1300 }));
      expect(fixture.componentInstance.aside.kind).toBe('detail');
    });

    it('hides Edit plot until the plot detail has loaded', () => {
      boot();
      el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
      fixture.detectChanges();
      expect(el().querySelector('.projects-plots__edit-plot')).toBeNull();
      http.expectOne('/api/company/projects/p1/plots/id-A-1').flush(detail({ id: 'id-A-1' }));
    });

    it('shows the locked edit variant for a BOOKED plot', () => {
      boot();
      selectFirstAvailable('BOOKED');
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
      expect(el().querySelector('app-plot-form input')).toBeNull();
    });

    it('maps a 409 on plot save to the duplicate plot number field error', () => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'A-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      http.expectOne('/api/company/projects/p1/plots').flush({ error: 'dup' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(fixture.componentInstance.duplicatePlotNo).toBeTrue();
      expect(el().textContent).toContain('admin.projectsPlots.error.duplicatePlotNo');
    });

    it('creates a plot then refreshes grid and project counts and closes the aside', () => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'C-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      http.expectOne('/api/company/projects/p1/plots').flush(detail());
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project({ totalPlots: 4 })]);
      expect(fixture.componentInstance.aside.kind).toBe('none');
    });

    it('creates a project, uploads its photo, and selects it', () => {
      boot();
      const photo = new File(['x'], 'p.png');
      fixture.componentInstance.saveProject({ request: { name: 'New', location: 'Goa' }, photo });
      http.expectOne({ method: 'POST', url: '/api/company/projects' }).flush(project({ id: 'p9', name: 'New' }));
      http.expectOne('/api/company/projects/p9/thumbnail').flush(null);
      http.expectOne('/api/company/projects').flush([project(), project({ id: 'p9', name: 'New' })]);
      http.expectOne('/api/projects/p9/plots/grid').flush([]);
      expect(fixture.componentInstance.selectedProject!.id).toBe('p9');
    });
  });
});
