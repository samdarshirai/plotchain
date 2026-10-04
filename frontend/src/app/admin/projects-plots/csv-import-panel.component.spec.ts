import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CsvImportPanelComponent } from './csv-import-panel.component';

describe('CsvImportPanelComponent', () => {
  let fixture: ComponentFixture<CsvImportPanelComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const file = new File(['a,b'], 'plots.csv');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CsvImportPanelComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(CsvImportPanelComponent);
    fixture.componentRef.setInput('projectId', 'p1');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('keeps Commit disabled until validation returns no errors', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate')
      .flush({ totalRows: 36, validRows: 34, errors: [{ rowNumber: 3, field: 'plotNo', message: 'dup' }] });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.csvRowError');
    expect(el().querySelector<HTMLButtonElement>('.csv-panel__commit')!.disabled).toBeTrue();
  });

  it('enables Commit on a clean validation, commits, and emits imported', () => {
    let imported = false;
    fixture.componentInstance.imported.subscribe(() => (imported = true));
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush({ totalRows: 2, validRows: 2, errors: [] });
    fixture.detectChanges();
    const commit = el().querySelector<HTMLButtonElement>('.csv-panel__commit')!;
    expect(commit.disabled).toBeFalse();
    commit.click();
    http.expectOne('/api/company/projects/p1/plots/csv/commit').flush(null, { status: 204, statusText: 'No Content' });
    expect(imported).toBeTrue();
  });

  it('shows a generic error when validation request fails', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.projectsPlots.csvGenericError');
  });

  it('ignores a validation response for a file that is no longer selected', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    const req = http.expectOne('/api/company/projects/p1/plots/csv/validate');
    fixture.componentInstance.onFile(new File(['z'], 'b.csv'));
    req.flush({ totalRows: 1, validRows: 1, errors: [] });
    fixture.detectChanges();
    expect(fixture.componentInstance.result).toBeNull();
    expect(fixture.componentInstance.busy).toBeFalse();
    expect(el().querySelector<HTMLButtonElement>('.csv-panel__commit')!.disabled).toBeTrue();
  });

  it('clears the clean result when commit fails', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush({ totalRows: 1, validRows: 1, errors: [] });
    fixture.componentInstance.commit();
    http.expectOne('/api/company/projects/p1/plots/csv/commit').flush('x', { status: 400, statusText: 'bad' });
    fixture.detectChanges();
    expect(fixture.componentInstance.failed).toBeTrue();
    expect(fixture.componentInstance.result).toBeNull();
    expect(el().querySelector<HTMLButtonElement>('.csv-panel__commit')!.disabled).toBeTrue();
  });

  it('forgets a previous validation result when a different file is chosen', () => {
    fixture.componentInstance.file = file;
    fixture.componentInstance.validate();
    http.expectOne('/api/company/projects/p1/plots/csv/validate').flush({ totalRows: 1, validRows: 1, errors: [] });
    fixture.componentInstance.onFile(new File(['z'], 'other.csv'));
    expect(fixture.componentInstance.result).toBeNull();
  });
});
