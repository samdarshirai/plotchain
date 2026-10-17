import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NewsComponent } from './news.component';

describe('NewsComponent', () => {
  let fixture: ComponentFixture<NewsComponent>;
  let httpMock: HttpTestingController;
  const item = { id: 'n1', newsDate: '2026-10-17', title: 'Launch', body: 'We launched' };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NewsComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(NewsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/news').flush([item]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersOneRowWithDateTitleBody', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.textContent).toContain('Launch');
    expect(el.textContent).toContain('2026-10-17');
  });

  it('createsThenReloads', () => {
    const c = fixture.componentInstance;
    c.openModal();
    c.form.patchValue({ newsDate: '2026-10-18', title: 'T', body: 'B' });
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/news' }).flush({ ...item, id: 'n2' });
    httpMock.expectOne('/api/admin/news').flush([item]);
    expect(c.modalOpen).toBeFalse();
  });

  it('doesNotPostWhenInvalid', () => {
    const c = fixture.componentInstance;
    c.openModal();
    c.form.patchValue({ title: '' });
    c.save();
    expect(c.modalOpen).toBeTrue();
  });
});
