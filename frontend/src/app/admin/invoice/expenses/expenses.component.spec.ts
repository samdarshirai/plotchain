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
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: ' Vendor ', amount: 50, payMode: 'UPI', bankName: 'HDFC', txnNo: ' T1 ' });
    c.save();
    const req = httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' });
    expect(req.request.body.payTo).toBe('Vendor');
    expect(req.request.body.txnNo).toBe('T1');
    req.flush(row);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([row]);
    expect(c.form.value.payTo).toBe('');
  });

  it('requiresBankAndTxnForNonCash', () => {
    const c = fixture.componentInstance;
    c.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: 'V', amount: 50, payMode: 'UPI', bankName: '', txnNo: '' });
    c.save();
    httpMock.expectNone({ method: 'POST', url: '/api/admin/expenses' });
    expect(c.issues.map(i => i.id)).toEqual(['bankName', 'txnNo']);
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

describe('ExpensesComponent default filters', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    jasmine.clock().install();
    // 01:30 local on 18 Oct: a UTC-based date would already be the 17th for UTC+5:30 and earlier zones.
    jasmine.clock().mockDate(new Date(2026, 9, 18, 1, 30));
    TestBed.configureTestingModule({ imports: [ExpensesComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('defaultsFromAndToToTheLast30DaysInclusiveInLocalTime', () => {
    const fixture = TestBed.createComponent(ExpensesComponent);
    expect(fixture.componentInstance.filters.getRawValue()).toEqual({ from: '2026-09-19', to: '2026-10-18', typeId: '', projectId: '' });
  });

  it('sendsTheDefaultDatesOnTheFirstListRequest', () => {
    const fixture = TestBed.createComponent(ExpensesComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/expense-types').flush([]);
    httpMock.expectOne('/api/company/projects').flush([]);
    const req = httpMock.expectOne(r => r.url === '/api/admin/expenses');
    expect(req.request.params.get('from')).toBe('2026-09-19');
    expect(req.request.params.get('to')).toBe('2026-10-18');
    expect(req.request.params.has('typeId')).toBeFalse();
    expect(req.request.params.has('projectId')).toBeFalse();
    req.flush([]);
    httpMock.verify();
  });

  it('stillLetsTheUserClearADateToRemoveThatBound', () => {
    const fixture = TestBed.createComponent(ExpensesComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/expense-types').flush([]);
    httpMock.expectOne('/api/company/projects').flush([]);
    httpMock.expectOne(r => r.url === '/api/admin/expenses').flush([]);
    fixture.componentInstance.filters.patchValue({ from: '' });
    const req = httpMock.expectOne(r => r.url === '/api/admin/expenses');
    expect(req.request.params.has('from')).toBeFalse();
    expect(req.request.params.get('to')).toBe('2026-10-18');
    req.flush([]);
    httpMock.verify();
  });
});

describe('ExpensesComponent add popup', () => {
  let fixture: ComponentFixture<ExpensesComponent>;
  let httpMock: HttpTestingController;
  let el: HTMLElement;
  const type = { id: 't1', name: 'Travel', status: 'ACTIVE' as const };
  const listReq = (r: { url: string }) => r.url === '/api/admin/expenses';
  const popup = () => el.querySelector('.invoice-expenses__modal');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ExpensesComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ExpensesComponent);
    httpMock = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/expense-types').flush([type]);
    httpMock.expectOne('/api/company/projects').flush([]);
    httpMock.expectOne(listReq).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const fillValid = () =>
    fixture.componentInstance.form.patchValue({ expenseDate: '2026-10-02', expenseTypeId: 't1', payTo: 'Vendor', amount: 50 });

  it('hidesTheFormUntilAddExpenseIsClicked', () => {
    expect(popup()).toBeNull();
    expect(el.querySelector('.invoice-expenses__form')).toBeNull();
    (el.querySelector('.invoice-expenses__intro .invoice-expenses__add') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(popup()).not.toBeNull();
    expect(popup()!.querySelector('form')).not.toBeNull();
  });

  it('cancelClosesAndDiscardsWhatWasTyped', () => {
    const c = fixture.componentInstance;
    c.openModal();
    c.form.patchValue({ payTo: 'Typed' });
    fixture.detectChanges();
    (popup()!.querySelector('.invoice-expenses__modal-cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(popup()).toBeNull();
    c.openModal();
    expect(c.form.value.payTo).toBe('');
  });

  it('successfulSaveClosesThePopupAndReloadsTheList', () => {
    const c = fixture.componentInstance;
    c.openModal();
    fillValid();
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' }).flush({});
    httpMock.expectOne(listReq).flush([]);
    fixture.detectChanges();
    expect(c.modalOpen).toBeFalse();
    expect(popup()).toBeNull();
  });

  it('failedSaveKeepsThePopupOpenAndShowsTheErrorInsideIt', () => {
    const c = fixture.componentInstance;
    c.openModal();
    fillValid();
    c.save();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' })
      .flush({ error: 'Expense type is inactive: Travel' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(c.modalOpen).toBeTrue();
    expect(popup()!.textContent).toContain('Expense type is inactive');
  });

  it('escapeClosesThePopup', () => {
    const c = fixture.componentInstance;
    c.openModal();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(c.modalOpen).toBeFalse();
  });

  it('escapeAndCancelAreIgnoredWhileASaveIsInFlight', () => {
    const c = fixture.componentInstance;
    c.openModal();
    fillValid();
    c.save();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    c.closeModal();
    expect(c.modalOpen).toBeTrue();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/expenses' }).flush({});
    httpMock.expectOne(listReq).flush([]);
    expect(c.modalOpen).toBeFalse();
  });

  it('opensEmptyEveryTimeWithCashAsThePayMode', () => {
    const c = fixture.componentInstance;
    c.openModal();
    c.form.patchValue({ payTo: 'X', payMode: 'UPI' });
    c.closeModal();
    c.openModal();
    expect(c.form.value.payTo).toBe('');
    expect(c.form.value.payMode).toBe('CASH');
  });
});
