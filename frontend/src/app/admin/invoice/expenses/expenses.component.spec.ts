import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ExpensesComponent } from './expenses.component';

describe('ExpensesComponent', () => {
  let fixture: ComponentFixture<ExpensesComponent>;
  let httpMock: HttpTestingController;
  const type = { id: 't1', name: 'Travel', status: 'ACTIVE' as const };
  const inactive = { id: 't2', name: 'Old', status: 'INACTIVE' as const };
  const row = { id: 'x1', expenseDate: '2026-10-01', expenseTypeId: 't1', expenseTypeName: 'Travel', projectId: null, projectName: null,
    payTo: 'Vendor', amount: 100, payMode: 'CASH', bankName: null, txnNo: null, remarks: null };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ExpensesComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ExpensesComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/expense-types').flush([type, inactive]);
    httpMock.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Green Acres' }]);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([row]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersListRow', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vendor');
  });

  it('offersOnlyActiveExpenseTypes', () => {
    expect(fixture.componentInstance.activeTypes.map(t => t.id)).toEqual(['t1']);
  });

  it('doesNotPostWhenInvalid', () => {
    fixture.componentInstance.save();
    expect(fixture.componentInstance.form.touched).toBeTrue();
  });

  it('postsTrimmedBodyThenReloadsAndResets', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: ' Vendor ', amount: 50, payMode: 'UPI', txnNo: '' });
    c.save();
    const req = httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' });
    expect(req.request.body.payTo).toBe('Vendor');
    expect(req.request.body.txnNo).toBeNull();
    req.flush(row);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([row]);
    expect(c.form.value.payTo).toBe('');
  });

  it('showsServerErrorOnFailure', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: 'V', amount: 50, payMode: 'CASH' });
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' }).flush({ error: 'Expense type is inactive: Old' }, { status: 409, statusText: 'Conflict' });
    expect(c.formError).toContain('inactive');
  });

  it('guardsDoubleSubmitAndClearsFlag', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: 'V', amount: 50, payMode: 'CASH' });
    c.save();
    c.save();
    const req = httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' });
    expect(c.saving).toBeTrue();
    req.flush(row);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([row]);
    expect(c.saving).toBeFalse();
  });

  it('clearsSavingFlagOnError', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: 'V', amount: 50, payMode: 'CASH' });
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' }).flush({ error: 'x' }, { status: 500, statusText: 'Err' });
    expect(c.saving).toBeFalse();
  });
});
