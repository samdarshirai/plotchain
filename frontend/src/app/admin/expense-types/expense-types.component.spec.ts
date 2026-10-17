import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ExpenseTypesComponent } from './expense-types.component';

describe('ExpenseTypesComponent', () => {
  let fixture: ComponentFixture<ExpenseTypesComponent>;
  let httpMock: HttpTestingController;
  const item = { id: 'e1', name: 'Travel', status: 'ACTIVE' as const };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ExpenseTypesComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ExpenseTypesComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/expense-types').flush([item]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersRowWithSNoNameStatusAndEdit', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.textContent).toContain('Travel');
    expect(el.textContent).toContain('Active');
    expect(el.querySelector('.expense-types__edit')).toBeTruthy();
  });

  it('editPutsThenReloads', () => {
    const c = fixture.componentInstance;
    c.openModal(item);
    c.form.patchValue({ status: 'INACTIVE' });
    c.save();
    httpMock.expectOne({ method: 'PUT', url: '/api/admin/expense-types/e1' }).flush({ ...item, status: 'INACTIVE' });
    httpMock.expectOne('/api/admin/expense-types').flush([{ ...item, status: 'INACTIVE' }]);
    expect(c.modalOpen).toBeFalse();
  });

  it('doesNotPostWhenNameBlank', () => {
    const c = fixture.componentInstance;
    c.openModal(null);
    c.save();
    expect(c.modalOpen).toBeTrue();
  });
});
