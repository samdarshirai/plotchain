import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsStepComponent } from './projects-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SetupService } from '../../setup.service';
import { CsvValidationResponse, Plot, PlotPageResponse, Project } from '../../models/project.model';
import { SetupStateResponse } from '../../models/setup-state.model';

describe('ProjectsStepComponent', () => {
  let fixture: ComponentFixture<ProjectsStepComponent>;
  let httpMock: HttpTestingController;

  const project: Project = {
    id: 'p1',
    name: 'Green Valley',
    location: 'Hyderabad',
    hasThumbnail: false,
    totalPlots: 1,
    availablePlots: 1,
    soldPlots: 0,
    createdAt: '2026-01-01T00:00:00Z'
  };

  const plot: Plot = {
    id: 'plot1',
    plotNo: 'A-101',
    plotType: 'NORMAL',
    areaSqft: 1200,
    rate: 500,
    price: 600000,
    status: 'AVAILABLE'
  };

  const setupState: SetupStateResponse = {
    steps: [{ number: 4, key: 'projects', complete: false, required: true, percentComplete: 0 }],
    canGoLive: false,
    launchedAt: null
  };

  // The step subscribes to SetupService.getState() (a shared, refresh$-driven observable) on
  // init, and again every time refresh() fires after a successful create/update/delete -- each
  // subscription triggers its own GET that HttpTestingController requires to be flushed or
  // matched, even though nothing in the component actually waits on the response.
  function flushSetupState(): void {
    httpMock.match('/api/company/setup-state').forEach(req => req.flush(setupState));
  }

  function flushProjectsList(projects: Project[] = [project]): void {
    httpMock.expectOne('/api/company/projects').flush(projects);
    flushSetupState();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectsStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectsStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SetupService);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads projects on init', () => {
    flushProjectsList();

    expect(fixture.componentInstance.projects).toEqual([project]);
  });

  it('creates a project via the add-project form', () => {
    flushProjectsList([]);
    const component = fixture.componentInstance;

    component.addProjectForm.setValue({ name: 'Green Valley', location: 'Hyderabad' });
    component.submitAddProject();

    const req = httpMock.expectOne('/api/company/projects');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Green Valley', location: 'Hyderabad' });
    req.flush(project);
    flushSetupState();

    expect(component.projects).toEqual([project]);
    expect(component.showAddProjectForm).toBe(false);
  });

  it('does not submit the add-project form while invalid', () => {
    flushProjectsList([]);
    const component = fixture.componentInstance;

    component.submitAddProject();

    expect(component.addProjectForm.invalid).toBe(true);
    httpMock.expectNone((req) => req.method === 'POST' && req.url === '/api/company/projects');
  });

  it('selecting a project loads its first page of plots', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    const page: PlotPageResponse = { plots: [plot], page: 0, size: 20, totalElements: 1 };

    component.selectProject('p1');

    const req = httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20');
    req.flush(page);

    expect(component.plotPage).toEqual(page);
    expect(component.activeTab).toBe('plotList');
  });

  it('switches to the Import CSV tab and back without reloading plots', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    component.selectProject('p1');
    httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20')
      .flush({ plots: [plot], page: 0, size: 20, totalElements: 1 });

    component.onTabChange('importCsv');
    expect(component.activeTab).toBe('importCsv');
    httpMock.expectNone((req) => req.url.includes('/plots?'));

    component.onTabChange('plotList');
    expect(component.activeTab).toBe('plotList');
  });

  it('adding a plot reloads the plot list and resets the form', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    component.selectProject('p1');
    httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20')
      .flush({ plots: [], page: 0, size: 20, totalElements: 0 });

    component.plotForm.setValue({
      plotNo: 'A-101', plotType: 'NORMAL', areaSqft: 1200, rate: 500, price: 600000, status: 'AVAILABLE'
    });
    component.submitAddPlot();

    const createReq = httpMock.expectOne('/api/company/projects/p1/plots');
    expect(createReq.request.method).toBe('POST');
    createReq.flush(plot);

    const reloadReq = httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20');
    reloadReq.flush({ plots: [plot], page: 0, size: 20, totalElements: 1 });
    flushSetupState();

    expect(component.plotPage?.plots).toEqual([plot]);
    expect(component.plotForm.value.plotNo).toBe('');
  });

  it('deleting a project removes it from the list', () => {
    flushProjectsList();
    const component = fixture.componentInstance;

    component.deleteProject('p1');

    const req = httpMock.expectOne('/api/company/projects/p1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    flushSetupState();

    expect(component.projects).toEqual([]);
  });

  it('validating a CSV file shows errors without committing anything', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    component.selectProject('p1');
    httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20')
      .flush({ plots: [], page: 0, size: 20, totalElements: 0 });

    const file = new File(['plot_no\n'], 'plots.csv', { type: 'text/csv' });
    component.onCsvFileSelected({ target: { files: [file] } } as unknown as Event);
    component.validateCsvFile();

    const response: CsvValidationResponse = {
      totalRows: 1,
      validRows: 0,
      errors: [{ rowNumber: 1, field: 'plot_type', message: 'plot_type must be NORMAL or CORNER' }]
    };
    const req = httpMock.expectOne('/api/company/projects/p1/plots/csv/validate');
    req.flush(response);

    expect(component.csvValidation).toEqual(response);
    httpMock.expectNone('/api/company/projects/p1/plots/csv/commit');
  });

  it('committing a clean CSV file reloads the plot list and clears validation state', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    component.selectProject('p1');
    httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20')
      .flush({ plots: [], page: 0, size: 20, totalElements: 0 });

    const file = new File(['plot_no\n'], 'plots.csv', { type: 'text/csv' });
    component.onCsvFileSelected({ target: { files: [file] } } as unknown as Event);
    component.csvValidation = { totalRows: 1, validRows: 1, errors: [] };
    component.commitCsvFile();

    const req = httpMock.expectOne('/api/company/projects/p1/plots/csv/commit');
    req.flush(null);

    const reloadReq = httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20');
    reloadReq.flush({ plots: [plot], page: 0, size: 20, totalElements: 1 });
    flushSetupState();

    expect(component.csvValidation).toBeNull();
    expect(component.csvFile).toBeNull();
    expect(component.plotPage?.plots).toEqual([plot]);
  });

  it('a 409 commit response populates the row errors instead of a generic failure', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    component.selectProject('p1');
    httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20')
      .flush({ plots: [], page: 0, size: 20, totalElements: 0 });

    const file = new File(['plot_no\n'], 'plots.csv', { type: 'text/csv' });
    component.onCsvFileSelected({ target: { files: [file] } } as unknown as Event);
    component.csvValidation = { totalRows: 1, validRows: 1, errors: [] };
    component.commitCsvFile();

    const errors = [{ rowNumber: 1, field: 'plot_no', message: 'duplicate plot_no within the file: A-101' }];
    httpMock.expectOne('/api/company/projects/p1/plots/csv/commit').flush(
      { error: 'CSV import rejected', errors },
      { status: 409, statusText: 'Conflict' }
    );

    expect(component.csvValidation?.errors).toEqual(errors);
  });

  it('changing pages requests the new page from the server', () => {
    flushProjectsList();
    const component = fixture.componentInstance;
    component.selectProject('p1');
    httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20')
      .flush({ plots: [plot], page: 0, size: 20, totalElements: 25 });

    component.goToPage(1);

    const req = httpMock.expectOne('/api/company/projects/p1/plots?page=1&size=20');
    req.flush({ plots: [], page: 1, size: 20, totalElements: 25 });

    expect(component.plotPage?.page).toBe(1);
  });

  it('does not render the inline step-nav when mode is setup (shell owns navigation there)', () => {
    flushProjectsList();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav).toBeNull();
  });

  it('passes the settings mode through to the step-nav', () => {
    flushProjectsList();
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav.componentInstance.mode).toBe('settings');
  });
});
