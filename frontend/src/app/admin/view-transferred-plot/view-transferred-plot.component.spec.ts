import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ViewTransferredPlotComponent } from './view-transferred-plot.component';

const row = () => ({ transferDate: '2026-03-02T10:00:00Z', associateCode: 'VA-1', associateName: 'Jane', associatePhone: '9',
  projectName: 'Alpha', plotNo: 'A-2', oldPlotNo: 'A-1', paidAmount: 1000, restAmount: 4000 });
const pageOf = (rows: any[]) => ({ transfers: rows, page: 0, size: 20, totalElements: rows.length });

describe('ViewTransferredPlotComponent', () => {
  let fixture: ComponentFixture<ViewTransferredPlotComponent>;
  let component: ViewTransferredPlotComponent;
  let http: HttpTestingController;
  const listReq = () => http.expectOne(r => r.url === '/api/admin/plot-transfers');
  const projects = () => http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ViewTransferredPlotComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(ViewTransferredPlotComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('defaults to first project and a last-month range', () => {
    projects();
    const r = listReq();
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('from')).toBe(component.from);
    expect(r.request.params.get('to')).toBe(component.to);
    r.flush(pageOf([]));
  });

  it('renders old plot and snapshot amounts; project change reloads', () => {
    projects();
    listReq().flush(pageOf([row()]));
    fixture.detectChanges();
    const cells = Array.from(fixture.nativeElement.querySelectorAll('tbody td')).map((td: any) => td.textContent.trim());
    expect(cells).toContain('A-1');
    expect(cells.length).toBe(10);
    component.onProject('p2');
    expect(listReq().request.params.get('projectId')).toBe('p2');
  });

  it('inverted range does not reload', () => {
    projects();
    listReq().flush(pageOf([]));
    component.onDate('from', '2999-01-01');
    expect(component.rangeError).toBe(true);
  });
});
