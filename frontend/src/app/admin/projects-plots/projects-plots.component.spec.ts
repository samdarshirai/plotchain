import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { ProjectsPlotsComponent } from './projects-plots.component';
import { BookPlotFormComponent } from './book-plot-form.component';
import { PlotFormComponent } from './plot-form.component';

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
    { id: 'a1', userId: 'VP00001', name: 'Jane', role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: true },
    { id: 'a2', userId: 'VP00002', name: 'Suspended', role: 'ASSOCIATE', status: 'SUSPENDED', hasFreeSlot: true },
    { id: 'adm', userId: 'ADMIN', name: 'Boss', role: 'ADMIN', status: 'ACTIVE', hasFreeSlot: false }
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
  afterEach(() => { http.verify(); el().remove(); });

  it('lists projects and loads the first project grid, grouped into blocks in natural order', fakeAsync(() => {
    boot();
    expect(el().textContent).toContain('Green Valley');
    const blocks = el().querySelectorAll('.projects-plots__block');
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelectorAll('app-plot-tile')[0].textContent).toContain('A-1');
    flush();
  }));

  it('shows the no-projects empty state and hides the list', fakeAsync(() => {
    boot([]);
    expect(el().textContent).toContain('admin.projectsPlots.empty.noProjectsTitle');
    expect(el().querySelector('.projects-plots__list')).toBeNull();
    flush();
  }));

  it('shows the empty-project state for a project with zero plots', fakeAsync(() => {
    boot([project({ totalPlots: 0, availablePlots: 0, soldPlots: 0 })], []);
    expect(el().textContent).toContain('admin.projectsPlots.empty.noPlotsTitle');
    flush();
  }));

  it('legend counts match the tiles and a chip filters the grid by status', fakeAsync(() => {
    boot();
    const chips = el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip');
    expect(chips[0].textContent).toContain('1');
    chips[1].click(); // BOOKED
    fixture.detectChanges();
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    const tiles = el().querySelectorAll('app-plot-tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('A-1');
    flush();
  }));

  it('shows the filter-empty message when the chosen status has no plots', fakeAsync(() => {
    boot([project()], [cell('A-1')]);
    el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip')[2].click(); // SOLD
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.empty.filter');
    flush();
  }));

  it('selecting a plot fetches its rate and shows the detail aside', fakeAsync(() => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    const req = http.expectOne('/api/company/projects/p1/plots/id-A-1');
    req.flush({ id: 'id-A-1', plotNo: 'A-1', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'BOOKED' });
    fixture.detectChanges();
    const aside = el().querySelector('.projects-plots__aside')!;
    expect(aside.textContent).toContain('A-1');
    expect(aside.textContent).toContain('3,750');
    flush();
  }));

  it('keeps the last good grid and shows a Retry banner when a refresh fails', fakeAsync(() => {
    boot();
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('boom', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(3);
    expect(el().textContent).toContain('admin.projectsPlots.error.loadGrid');
    expect(el().querySelector('.projects-plots__retry')).not.toBeNull();
    flush();
  }));

  it('switching project resets the selected plot and aside', fakeAsync(() => {
    boot([project(), project({ id: 'p2', name: 'Lake View' })]);
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    http.expectOne('/api/company/projects/p1/plots/id-A-1').flush({ rate: 1 });
    fixture.componentInstance.selectProject(fixture.componentInstance.projects![1]);
    http.expectOne('/api/projects/p2/plots/grid').flush([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.aside.kind).toBe('none');
    expect(fixture.componentInstance.selectedPlot).toBeNull();
    flush();
  }));

  it('switching project clears a previous grid-load error and shows the skeleton', fakeAsync(() => {
    boot([project(), project({ id: 'p2', name: 'Lake View' })]);
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('boom', { status: 500, statusText: 'err' });
    fixture.componentInstance.selectProject(fixture.componentInstance.projects![1]);
    fixture.detectChanges();
    expect(el().textContent).not.toContain('admin.projectsPlots.error.loadGrid');
    expect(el().querySelector('.projects-plots__skeleton')).not.toBeNull();
    http.expectOne('/api/projects/p2/plots/grid').flush([]);
    flush();
  }));

  it('Add project is usable with zero projects', fakeAsync(() => {
    boot([]);
    fixture.componentInstance.openAside({ kind: 'project', mode: 'add' });
    fixture.detectChanges();
    expect(el().querySelector('.projects-plots__aside')).not.toBeNull();
    flush();
  }));

  it('block summary shows whole-block counts while a status filter is active', fakeAsync(() => {
    boot([project()], [cell('A-1'), cell('A-2', 'BOOKED'), cell('A-3', 'SOLD')]);
    el().querySelectorAll<HTMLButtonElement>('.projects-plots__chip')[1].click(); // BOOKED
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
    expect(fixture.componentInstance.blockStats['A']).toEqual({ available: 1, total: 3 });
    flush();
  }));

  it('shows a dash when the plot detail has no rate', fakeAsync(() => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    http.expectOne('/api/company/projects/p1/plots/id-A-1').flush({ id: 'id-A-1' });
    fixture.detectChanges();
    expect(el().querySelector('.projects-plots__facts')!.textContent).toContain('—');
    flush();
  }));

  describe('plot and project mutations', () => {
    it('opens the CSV panel and refreshes grid and counts after a successful import', fakeAsync(() => {
      boot();
      el().querySelectorAll<HTMLButtonElement>('.projects-plots__project-actions button')[1].click();
      fixture.detectChanges();
      expect(el().querySelector('app-csv-import-panel')).not.toBeNull();
      fixture.componentInstance.onCsvImported();
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-1')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.aside.kind).toBe('none');
      flush();
    }));

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

    it('offers Edit plot on an AVAILABLE plot and PUTs the change, then refreshes grid and project counts', fakeAsync(() => {
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
      flush();
    }));

    it('hides Edit plot until the plot detail has loaded', fakeAsync(() => {
      boot();
      el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
      fixture.detectChanges();
      expect(el().querySelector('.projects-plots__edit-plot')).toBeNull();
      http.expectOne('/api/company/projects/p1/plots/id-A-1').flush(detail({ id: 'id-A-1' }));
      flush();
    }));

    it('shows the locked edit variant for a BOOKED plot', fakeAsync(() => {
      boot();
      selectFirstAvailable('BOOKED');
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
      expect(el().querySelector('app-plot-form input')).toBeNull();
      flush();
    }));

    it('maps a 409 on plot save to the duplicate plot number field error', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'A-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      http.expectOne('/api/company/projects/p1/plots').flush({ error: 'dup' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(fixture.componentInstance.duplicatePlotNo).toBeTrue();
      expect(el().textContent).toContain('admin.projectsPlots.error.duplicatePlotNo');
      flush();
    }));

    it('creates a plot then refreshes grid and project counts and closes the aside', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'C-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      http.expectOne('/api/company/projects/p1/plots').flush(detail());
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project({ totalPlots: 4 })]);
      expect(fixture.componentInstance.aside.kind).toBe('none');
      flush();
    }));

    it('create ok + photo upload fail: closes aside, reloads list, warns, and only one POST was made', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'project', mode: 'add' });
      fixture.componentInstance.saveProject({ request: { name: 'New', location: 'Goa' }, photo: new File(['x'], 'p.png') });
      http.expectOne({ method: 'POST', url: '/api/company/projects' }).flush(project({ id: 'p9', name: 'New' }));
      http.expectOne('/api/company/projects/p9/thumbnail').flush('bad', { status: 400, statusText: 'Bad' });
      http.expectOne('/api/company/projects').flush([project(), project({ id: 'p9', name: 'New' })]);
      http.expectOne('/api/projects/p9/plots/grid').flush([]);
      fixture.detectChanges();
      expect(fixture.componentInstance.aside.kind).toBe('none');
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'warning', key: 'admin.projectsPlots.error.photoUploadFailed' }));
      expect(el().textContent).toContain('admin.projectsPlots.error.photoUploadFailed');
      flush();
    }));

    it('edit ok + photo upload fail: list is reloaded with the new name', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'project', mode: 'edit' });
      fixture.componentInstance.saveProject({ request: { name: 'Renamed', location: 'Goa' }, photo: new File(['x'], 'p.png') });
      http.expectOne({ method: 'PUT', url: '/api/company/projects/p1' }).flush(project({ name: 'Renamed' }));
      http.expectOne('/api/company/projects/p1/thumbnail').flush('bad', { status: 500, statusText: 'err' });
      http.expectOne('/api/company/projects').flush([project({ name: 'Renamed' })]);
      fixture.detectChanges();
      expect(fixture.componentInstance.projects![0].name).toBe('Renamed');
      expect(fixture.componentInstance.aside.kind).toBe('none');
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'warning' }));
      flush();
    }));

    it('edit-save then selecting plot B before the response does not overwrite detail or force the aside', fakeAsync(() => {
      boot([project()], [cell('A-2'), cell('B-2')]);
      selectFirstAvailable();
      fixture.componentInstance.openAside({ kind: 'editPlot' });
      fixture.componentInstance.saveEditedPlot({ plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      fixture.componentInstance.selectPlot(fixture.componentInstance.grid!.find(g => g.plotNo === 'B-2')!);
      const bReq = http.expectOne('/api/company/projects/p1/plots/id-B-2'); // left pending
      http.expectOne({ method: 'PUT', url: '/api/company/projects/p1/plots/id-A-2' }).flush(detail());
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2'), cell('B-2')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.plotDetail).toBeNull();
      expect(fixture.componentInstance.aside.kind).toBe('detail');
      http.expectNone('/api/company/projects/p1/plots/id-A-2');
      bReq.flush(detail({ id: 'id-B-2', plotNo: 'B-2' }));
      flush();
    }));

    it('edit-save then switching project forces no aside and fetches nothing for the new project', fakeAsync(() => {
      boot([project(), project({ id: 'p2', name: 'Other' })], [cell('A-2')]);
      selectFirstAvailable();
      fixture.componentInstance.openAside({ kind: 'editPlot' });
      fixture.componentInstance.saveEditedPlot({ plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      fixture.componentInstance.selectProjectById('p2');
      http.expectOne('/api/projects/p2/plots/grid').flush([]);
      http.expectOne({ method: 'PUT', url: '/api/company/projects/p1/plots/id-A-2' }).flush(detail());
      http.expectOne('/api/company/projects').flush([project(), project({ id: 'p2', name: 'Other' })]);
      expect(fixture.componentInstance.aside.kind).toBe('none');
      http.expectNone(r => r.url.includes('/plots/id-A-2'));
      flush();
    }));

    it('add-plot success while a book form is open leaves the book form', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.componentInstance.saveNewPlot({ plotNo: 'C-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' });
      fixture.componentInstance.aside = { kind: 'book' };
      http.expectOne('/api/company/projects/p1/plots').flush(detail());
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.aside.kind).toBe('book');
      flush();
    }));

    it('csv-import success while a book form is open leaves the book form', fakeAsync(() => {
      boot();
      fixture.componentInstance.aside = { kind: 'book' };
      fixture.componentInstance.onCsvImported();
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.aside.kind).toBe('book');
      flush();
    }));

    it('Add plot returns focus to its opener button on close', fakeAsync(() => {
      boot();
      const btns = el().querySelectorAll<HTMLButtonElement>('.projects-plots__project-actions button');
      document.body.appendChild(el());
      btns[2].focus();
      btns[2].click();
      fixture.detectChanges();
      fixture.componentInstance.closeAside();
      tick();
      expect(document.activeElement).toBe(btns[2]);
    }));

    it('creates a project, uploads its photo, and selects it', fakeAsync(() => {
      boot();
      const photo = new File(['x'], 'p.png');
      fixture.componentInstance.saveProject({ request: { name: 'New', location: 'Goa' }, photo });
      http.expectOne({ method: 'POST', url: '/api/company/projects' }).flush(project({ id: 'p9', name: 'New' }));
      http.expectOne('/api/company/projects/p9/thumbnail').flush(null);
      http.expectOne('/api/company/projects').flush([project(), project({ id: 'p9', name: 'New' })]);
      http.expectOne('/api/projects/p9/plots/grid').flush([]);
      expect(fixture.componentInstance.selectedProject!.id).toBe('p9');
      flush();
    }));
  });

  describe('booking', () => {
    const detail = { id: 'id-A-2', plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'AVAILABLE' };
    const form = { associateId: 'a1', buyerName: 'Rohit', buyerPhone: '' };

    function openBookForm(status = 'AVAILABLE') {
      boot([project()], [cell('A-2', status)]);
      el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status });
      fixture.detectChanges();
    }

    it('offers Book on an AVAILABLE plot and opens the form with only ASSOCIATE-role lookups', fakeAsync(() => {
      openBookForm();
      el().querySelector<HTMLButtonElement>('.projects-plots__book')!.click();
      fixture.detectChanges();
      expect(el().querySelector('app-book-plot-form')).not.toBeNull();
      expect(fixture.componentInstance.associates.map(a => a.id)).toEqual(['a1']);
      flush();
    }));

    it('disables Book on a BOOKED plot and explains why in text', fakeAsync(() => {
      openBookForm('BOOKED');
      const btn = el().querySelector<HTMLButtonElement>('.projects-plots__book')!;
      expect(btn.disabled).toBeTrue();
      expect(el().textContent).toContain('admin.projectsPlots.bookDisabledBooked');
      expect(btn.getAttribute('aria-describedby')).toBe('book-disabled-reason');
      flush();
    }));

    it('explains a SOLD plot too', fakeAsync(() => {
      openBookForm('SOLD');
      expect(el().textContent).toContain('admin.projectsPlots.bookDisabledSold');
      flush();
    }));

    it('on 201 refreshes the grid, shows the success banner with a view-booking link, returns to detail', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      const post = http.expectOne('/api/admin/bookings');
      expect(post.request.body).toEqual({ plotId: 'id-A-2', associateId: 'a1', buyerName: 'Rohit', buyerPhone: undefined });
      post.flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 4500000, installmentCount: 4 }, { status: 201, statusText: 'Created' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status: 'BOOKED' });
      fixture.detectChanges();
      expect(fixture.componentInstance.aside.kind).toBe('detail');
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'success', bookingId: 'b1' }));
      expect(el().querySelector('.projects-plots__aside a')!.getAttribute('href')).toContain('booking=b1');
      flush();
    }));

    it('on 409 refreshes the grid, shows the warning banner and returns to the (now booked) detail', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ error: 'Plot is not available' }, { status: 409, statusText: 'Conflict' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status: 'BOOKED' });
      fixture.detectChanges();
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'warning', key: 'admin.projectsPlots.error.conflict' }));
      expect(fixture.componentInstance.selectedPlot!.status).toBe('BOOKED');
      expect(el().querySelector<HTMLButtonElement>('.projects-plots__book')!.disabled).toBeTrue();
      flush();
    }));

    it('shows the server error text on a 400 and keeps the form open and re-enabled', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ error: 'buyerName must not be blank' }, { status: 400, statusText: 'Bad Request' });
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'danger', text: 'buyerName must not be blank' }));
      expect(fixture.componentInstance.aside.kind).toBe('book');
      expect(fixture.componentInstance.busy).toBeFalse();
      flush();
    }));

    it('shows a generic error on a network failure and keeps the form', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').error(new ProgressEvent('error'));
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ key: 'admin.projectsPlots.error.generic' }));
      expect(fixture.componentInstance.aside.kind).toBe('book');
      flush();
    }));

    it('lets the request finish after a mid-flight cancel and renders the page-level success banner with the link', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.closeAside();
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status: 'BOOKED' });
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedPlot!.status).toBe('BOOKED');
      expect(fixture.componentInstance.aside.kind).toBe('none');
      expect(el().querySelector('.projects-plots__aside')).toBeNull();
      const banners = el().querySelectorAll('app-inline-banner [role="status"]');
      expect(banners.length).toBe(1);
      expect(banners[0].textContent).toContain('admin.projectsPlots.banner.booked');
      expect(banners[0].querySelector('a')!.getAttribute('href')).toContain('booking=b1');
      flush();
    }));

    it('renders the 409 warning at page level after a mid-flight cancel', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.closeAside();
      http.expectOne('/api/admin/bookings').flush({ error: 'x' }, { status: 409, statusText: 'Conflict' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status: 'BOOKED' });
      fixture.detectChanges();
      const alerts = el().querySelectorAll('app-inline-banner [role="alert"]');
      expect(alerts.length).toBe(1);
      expect(alerts[0].textContent).toContain('admin.projectsPlots.error.conflict');
      flush();
    }));

    it('does not refetch a grid for another project when the outcome lands after switching projects', fakeAsync(() => {
      boot([project(), project({ id: 'p2', name: 'Other' })], [cell('A-2')]);
      el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail);
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.selectProjectById('p2');
      http.expectOne('/api/projects/p2/plots/grid').flush([]);
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 }, { status: 201, statusText: 'Created' });
      http.expectNone(r => r.url.endsWith('/plots/grid'));
      http.expectOne('/api/company/projects').flush([project(), project({ id: 'p2', name: 'Other' })]);
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'success', bookingId: 'b1' }));
      flush();
    }));

    it('after 201, Edit plot is hidden until the plot is re-fetched, then the form is locked and no PUT can be issued', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 }, { status: 201, statusText: 'Created' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      fixture.detectChanges();
      expect(fixture.componentInstance.plotDetail).toBeNull();
      expect(el().querySelector('.projects-plots__edit-plot')).toBeNull();
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status: 'BOOKED' });
      fixture.detectChanges();
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
      expect(el().querySelector('app-plot-form form')).toBeNull();
      flush();
    }));

    it('after 409, the plot is re-fetched and the edit form is locked', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ error: 'x' }, { status: 409, statusText: 'Conflict' });
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      expect(fixture.componentInstance.plotDetail).toBeNull();
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush({ ...detail, status: 'BOOKED' });
      fixture.detectChanges();
      el().querySelector<HTMLButtonElement>('.projects-plots__edit-plot')!.click();
      fixture.detectChanges();
      expect(el().querySelector('app-plot-form form')).toBeNull();
      flush();
    }));

    it('locks the edit form when the grid says BOOKED even though plotDetail is stale AVAILABLE', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.loadGrid();
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      fixture.componentInstance.openAside({ kind: 'editPlot' });
      fixture.detectChanges();
      expect(fixture.componentInstance.plotDetail!.status).toBe('AVAILABLE');
      expect(el().querySelector('app-plot-form form')).toBeNull();
      expect(el().textContent).toContain('admin.projectsPlots.editLockedTitle');
      flush();
    }));

    it('Escape closes the aside; an Escape already handled (defaultPrevented) does not', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      handled.preventDefault();
      fixture.componentInstance.onEscape(handled);
      expect(fixture.componentInstance.aside.kind).toBe('addPlot');
      fixture.componentInstance.onEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(fixture.componentInstance.aside.kind).toBe('none');
      flush();
    }));

    it('real Escape keydown: a handler lower in the tree that prevents default keeps the aside open; otherwise it closes', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      const swallow = (e: Event) => e.preventDefault();
      document.body.addEventListener('keydown', swallow, { once: true });
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(fixture.componentInstance.aside.kind).toBe('addPlot');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(fixture.componentInstance.aside.kind).toBe('none');
      flush();
    }));

    it('ignores a second submit while the first is in flight', fakeAsync(() => {
      openBookForm();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.submitBooking(form);
      expect(http.match('/api/admin/bookings').length).toBe(1);
      flush();
    }));
  });

  describe('wave 2 fixes', () => {
    const detail = (over: Record<string, unknown> = {}) =>
      ({ id: 'id-A-2', plotNo: 'A-2', plotType: 'NORMAL', areaSqft: 1200, rate: 3750, price: 4500000, status: 'AVAILABLE', ...over });
    const newPlot = { plotNo: 'C-1', plotType: 'NORMAL', areaSqft: 1, rate: 1, price: 1, status: 'AVAILABLE' } as const;
    const form = { associateId: 'a1', buyerName: 'Rohit', buyerPhone: '' };
    const actions = () => el().querySelectorAll<HTMLButtonElement>('.projects-plots__project-actions button');

    function openDetail() {
      boot([project()], [cell('A-2')]);
      document.body.appendChild(el());
      el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail());
      fixture.detectChanges();
    }

    it('a successful plot save returns focus to the opener', fakeAsync(() => {
      boot();
      document.body.appendChild(el());
      const add = actions()[2];
      add.focus(); add.click(); fixture.detectChanges();
      fixture.componentInstance.saveNewPlot({ ...newPlot });
      http.expectOne('/api/company/projects/p1/plots').flush(detail());
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project()]);
      fixture.detectChanges(); tick();
      expect(fixture.componentInstance.aside.kind).toBe('none');
      expect(document.activeElement).toBe(actions()[2]);
    }));

    it('a successful CSV import returns focus to the opener', fakeAsync(() => {
      boot();
      document.body.appendChild(el());
      const csv = actions()[1];
      csv.focus(); csv.click(); fixture.detectChanges();
      fixture.componentInstance.onCsvImported();
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('C-1')]);
      http.expectOne('/api/company/projects').flush([project()]);
      fixture.detectChanges(); tick();
      expect(document.activeElement).toBe(actions()[1]);
    }));

    it('an opener clicked while the detail aside is open gets focus back on close', fakeAsync(() => {
      openDetail();
      const add = actions()[2];
      add.focus(); add.click(); fixture.detectChanges();
      expect(fixture.componentInstance.aside.kind).toBe('addPlot');
      fixture.componentInstance.closeAside();
      tick();
      expect(document.activeElement).toBe(add);
    }));

    it('a booking 201 puts focus on a live control in the re-rendered detail aside (tile when Book is disabled)', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.detectChanges();
      el().querySelector<HTMLButtonElement>('.projects-plots__aside button')!.focus();
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 });
      fixture.detectChanges(); tick();
      expect(document.activeElement).toBe(el().querySelector('[data-plot-id="id-A-2"] button'));
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail({ status: 'BOOKED' }));
    }));

    it('a booking 409 leaves focus on the tile, not a Book button the refresh then disables', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.detectChanges();
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ error: 'taken' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges(); tick();
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail({ status: 'BOOKED' }));
      fixture.detectChanges(); tick();
      expect(el().querySelector<HTMLButtonElement>('.projects-plots__book')!.disabled).toBeTrue();
      expect(document.activeElement).toBe(el().querySelector('[data-plot-id="id-A-2"] button'));
    }));

    it('cancel from the book form focuses the Book button in the detail aside', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.detectChanges();
      fixture.componentInstance.backToDetail('.projects-plots__book');
      fixture.detectChanges(); tick();
      expect(document.activeElement).toBe(el().querySelector('.projects-plots__book'));
    }));

    it('cancel from the edit form focuses Edit plot in the detail aside', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'editPlot' });
      fixture.detectChanges();
      fixture.componentInstance.backToDetail('.projects-plots__edit-plot');
      fixture.detectChanges(); tick();
      expect(document.activeElement).toBe(el().querySelector('.projects-plots__edit-plot'));
    }));

    it('with no focused opener (Safari leaves body active) close falls back to the tile', fakeAsync(() => {
      boot();
      document.body.appendChild(el());
      (document.activeElement as HTMLElement | null)?.blur();
      expect(document.activeElement).toBe(document.body);
      fixture.componentInstance.selectPlot(fixture.componentInstance.grid![0]);
      http.expectOne(r => /\/api\/company\/projects\/p1\/plots\//.test(r.url)).flush(detail());
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.detectChanges();
      fixture.componentInstance.closeAside();
      tick();
      expect(document.activeElement).toBe(el().querySelector(`[data-plot-id="${fixture.componentInstance.selectedPlotId}"] button`));
    }));

    it('a project save finishing after the admin opened a plot detail leaves that detail open', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'project', mode: 'add' });
      fixture.componentInstance.saveProject({ request: { name: 'New', location: 'Goa' }, photo: null });
      fixture.componentInstance.selectPlot(fixture.componentInstance.grid![0]);
      http.expectOne(r => /\/api\/company\/projects\/p1\/plots\//.test(r.url)).flush(detail());
      http.expectOne({ method: 'POST', url: '/api/company/projects' }).flush(project({ id: 'p1' }));
      http.expectOne('/api/company/projects').flush([project()]);
      tick();
      expect(fixture.componentInstance.aside.kind).toBe('detail');
    }));

    it('a plot save in flight does not put the book form into the busy state', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.saveNewPlot({ ...newPlot });
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(BookPlotFormComponent)).componentInstance.busy).toBeFalse();
      http.expectOne('/api/company/projects/p1/plots').flush(detail(), { status: 500, statusText: 'x' });
      flush();
    }));

    it('a booking in flight does not disable the plot form', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      fixture.componentInstance.openAside({ kind: 'addPlot' });
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(PlotFormComponent)).componentInstance.busy).toBeFalse();
      http.expectOne('/api/admin/bookings').flush({ error: 'x' }, { status: 500, statusText: 'x' });
      flush();
    }));

    it('marks the plot BOOKED locally on 201, before the grid refresh returns', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 });
      fixture.detectChanges();
      const btn = el().querySelector<HTMLButtonElement>('.projects-plots__book')!;
      expect(btn.disabled).toBeTrue();
      expect(el().textContent).toContain('admin.projectsPlots.bookDisabledBooked');
      expect(fixture.componentInstance.counts.BOOKED).toBe(1);
      http.expectOne('/api/projects/p1/plots/grid').flush([cell('A-2', 'BOOKED')]);
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail({ status: 'BOOKED' }));
      flush();
    }));

    it('keeps the local BOOKED mark when the grid refresh fails', fakeAsync(() => {
      openDetail();
      fixture.componentInstance.openAside({ kind: 'book' });
      fixture.componentInstance.submitBooking(form);
      http.expectOne('/api/admin/bookings').flush({ id: 'b1', plotId: 'id-A-2', buyerName: 'Rohit', totalAmount: 1, installmentCount: 1 });
      http.expectOne('/api/projects/p1/plots/grid').error(new ProgressEvent('error'));
      http.expectOne('/api/company/projects').flush([project()]);
      http.expectOne('/api/company/projects/p1/plots/id-A-2').flush(detail({ status: 'BOOKED' }));
      expect(fixture.componentInstance.selectedPlot!.status).toBe('BOOKED');
      flush();
    }));

    it('keeps the photo-upload warning when the project list reload fails', fakeAsync(() => {
      boot();
      fixture.componentInstance.openAside({ kind: 'project', mode: 'add' });
      fixture.componentInstance.saveProject({ request: { name: 'New', location: 'Goa' }, photo: new File(['x'], 'p.png') });
      http.expectOne({ method: 'POST', url: '/api/company/projects' }).flush(project({ id: 'p9', name: 'New' }));
      http.expectOne('/api/company/projects/p9/thumbnail').flush('bad', { status: 400, statusText: 'Bad' });
      http.expectOne('/api/company/projects').error(new ProgressEvent('error'));
      fixture.detectChanges();
      expect(fixture.componentInstance.projectsError).toBeTrue();
      expect(fixture.componentInstance.banner).toEqual(jasmine.objectContaining({ tone: 'warning', key: 'admin.projectsPlots.error.photoUploadFailed' }));
      flush();
    }));
  });
});
