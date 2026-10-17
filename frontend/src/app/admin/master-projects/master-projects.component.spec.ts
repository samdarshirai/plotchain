import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MasterProjectsComponent } from './master-projects.component';

describe('MasterProjectsComponent', () => {
  let fixture: ComponentFixture<MasterProjectsComponent>;
  let httpMock: HttpTestingController;
  const project = {
    id: 'p1', name: 'Green Valley', type: 'PLOT', city: 'Pune', state: 'MH',
    businessPercentage: 40, ratePerSqft: 1500, status: 'ACTIVE',
    hasLocationMap: true, hasProjectMap: false
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MasterProjectsComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(MasterProjectsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/master-projects').flush([project]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersOneRowWithEditAndOnlyTheMapButtonsThatHaveFiles', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.querySelector('.master-projects__edit')).not.toBeNull();
    expect(el.querySelector('.master-projects__location-map')).not.toBeNull();
    expect(el.querySelector('.master-projects__project-map')).toBeNull();
    expect(el.textContent).toContain('40%');
  });

  it('suspendsViaStatusUpdateWithoutMapFlagsInBody', () => {
    (fixture.nativeElement.querySelector('.master-projects__toggle') as HTMLButtonElement).click();
    const req = httpMock.expectOne({ method: 'PUT', url: '/api/admin/master-projects/p1' });
    expect(req.request.body.status).toBe('SUSPENDED');
    expect(req.request.body.hasLocationMap).toBeUndefined();
    req.flush({ ...project, status: 'SUSPENDED' });
    httpMock.expectOne('/api/admin/master-projects').flush([]);
  });

  it('createsThenReloads', () => {
    const c = fixture.componentInstance;
    c.openModal(null);
    c.form.patchValue({ name: 'New', city: 'C', state: 'S' });
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/master-projects' }).flush({ ...project, id: 'p2' });
    httpMock.expectOne('/api/admin/master-projects').flush([project]);
    expect(c.modalOpen).toBeFalse();
  });
});
