import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProjectsService } from './projects.service';
import {
  CsvValidationResponse,
  Plot,
  PlotPageResponse,
  PlotRequest,
  Project,
  ProjectRequest
} from '../../models/project.model';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let httpMock: HttpTestingController;

  const project: Project = {
    id: 'p1',
    name: 'Green Valley',
    location: 'Hyderabad',
    hasThumbnail: false,
    totalPlots: 5,
    availablePlots: 3,
    soldPlots: 2,
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ProjectsService]
    });
    service = TestBed.inject(ProjectsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists projects', () => {
    let result: Project[] | undefined;
    service.listProjects().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects');
    expect(req.request.method).toBe('GET');
    req.flush([project]);

    expect(result).toEqual([project]);
  });

  it('gets a single project', () => {
    let result: Project | undefined;
    service.getProject('p1').subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects/p1');
    expect(req.request.method).toBe('GET');
    req.flush(project);

    expect(result).toEqual(project);
  });

  it('creates a project', () => {
    const request: ProjectRequest = { name: 'Green Valley', location: 'Hyderabad' };
    let result: Project | undefined;
    service.createProject(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(project);

    expect(result).toEqual(project);
  });

  it('updates a project', () => {
    const request: ProjectRequest = { name: 'Blue Ridge', location: 'Pune' };
    let result: Project | undefined;
    service.updateProject('p1', request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush({ ...project, ...request });

    expect(result?.location).toBe('Pune');
  });

  it('deletes a project', () => {
    let completed = false;
    service.deleteProject('p1').subscribe(() => (completed = true));

    const req = httpMock.expectOne('/api/company/projects/p1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBe(true);
  });

  it('uploads a thumbnail as multipart form data', () => {
    const file = new File(['abc'], 'thumb.png', { type: 'image/png' });
    let completed = false;
    service.uploadThumbnail('p1', file).subscribe(() => (completed = true));

    const req = httpMock.expectOne('/api/company/projects/p1/thumbnail');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush(null);

    expect(completed).toBe(true);
  });

  it('builds a thumbnail URL', () => {
    expect(service.thumbnailUrl('p1')).toBe('/api/company/projects/p1/thumbnail');
  });

  it('lists plots for a project page', () => {
    const page: PlotPageResponse = { plots: [plot], page: 0, size: 20, totalElements: 1 };
    let result: PlotPageResponse | undefined;
    service.listPlots('p1', 0, 20).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects/p1/plots?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(page);

    expect(result).toEqual(page);
  });

  it('creates a plot', () => {
    const request: PlotRequest = {
      plotNo: 'A-101', plotType: 'NORMAL', areaSqft: 1200, rate: 500, price: 600000, status: 'AVAILABLE'
    };
    let result: Plot | undefined;
    service.createPlot('p1', request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects/p1/plots');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(plot);

    expect(result).toEqual(plot);
  });

  it('updates a plot', () => {
    const request: PlotRequest = {
      plotNo: 'A-102', plotType: 'CORNER', areaSqft: 1300, rate: 550, price: 715000, status: 'BOOKED'
    };
    let result: Plot | undefined;
    service.updatePlot('p1', 'plot1', request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects/p1/plots/plot1');
    expect(req.request.method).toBe('PUT');
    req.flush({ ...plot, ...request });

    expect(result?.plotNo).toBe('A-102');
  });

  it('deletes a plot', () => {
    let completed = false;
    service.deletePlot('p1', 'plot1').subscribe(() => (completed = true));

    const req = httpMock.expectOne('/api/company/projects/p1/plots/plot1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBe(true);
  });

  it('builds a csv template URL', () => {
    expect(service.csvTemplateUrl()).toBe('/api/company/projects/plots/csv-template');
  });

  it('validates a csv file as multipart form data', () => {
    const file = new File(['plot_no\n'], 'plots.csv', { type: 'text/csv' });
    const response: CsvValidationResponse = { totalRows: 1, validRows: 1, errors: [] };
    let result: CsvValidationResponse | undefined;
    service.validateCsv('p1', file).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/projects/p1/plots/csv/validate');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('commits a csv file as multipart form data', () => {
    const file = new File(['plot_no\n'], 'plots.csv', { type: 'text/csv' });
    let completed = false;
    service.commitCsv('p1', file).subscribe(() => (completed = true));

    const req = httpMock.expectOne('/api/company/projects/p1/plots/csv/commit');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush(null);

    expect(completed).toBe(true);
  });
});
