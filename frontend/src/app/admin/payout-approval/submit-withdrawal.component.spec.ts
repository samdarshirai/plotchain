import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SubmitWithdrawalComponent } from './submit-withdrawal.component';

describe('SubmitWithdrawalComponent', () => {
  let fixture: ComponentFixture<SubmitWithdrawalComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmitWithdrawalComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SubmitWithdrawalComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET')
      .flush([{ id: 'a1', userId: 'VP00001', name: 'Jane Doe' }]);
  });

  afterEach(() => httpMock.verify());

  it('submits the form and shows a success banner with the created request, including its status', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ associateId: 'a1', amount: 5000 });
    req.flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REQUESTED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: null, disbursedAt: null
    });

    expect(fixture.componentInstance.submitted?.id).toBe('w1');
    expect(fixture.componentInstance.submitted?.status).toBe('REQUESTED');
    expect(fixture.componentInstance.submitError).toBeNull();
  });

  it('shows an auto-approved status when the backend returns one', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 100 });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/admin/withdrawals').flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 100, status: 'APPROVED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T00:00:00Z', disbursedAt: null
    });

    expect(fixture.componentInstance.submitted?.status).toBe('APPROVED');
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ associateId: '', amount: null });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/admin/withdrawals');
    expect(fixture.componentInstance.submitted).toBeNull();
  });

  it('shows field errors on a 400 validation failure', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ error: 'Validation failed', fields: { amount: 'Amount must be positive' } }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.fieldError('amount')).toBe('Amount must be positive');
  });

  it('shows the backend\'s own message on a 409 conflict (e.g. KYC not verified) so a blocked associate is discoverable at the point of action', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ error: 'Associate KYC is not verified: a1' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBe('Associate KYC is not verified: a1');
  });

  it('shows the 409 error in a danger inline banner above the form', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ error: 'Associate KYC is not verified: a1' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('.inline-banner--danger');
    expect(banner?.textContent).toContain('Associate KYC is not verified: a1');
  });

  it('shows a generic error on a non-400/409 failure', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    // No translateService.setTranslation() call in this spec's beforeEach (matching
    // record-sale.component.spec.ts's own convention) -- TranslateModule.forRoot() with no
    // loaded translations makes translate.instant() return the key itself, not real English
    // text, so this asserts presence/truthiness rather than an exact string.
    expect(fixture.componentInstance.submitError).toBeTruthy();
  });

  it('shows a neutral status chip for a REQUESTED (queued) submission', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/admin/withdrawals').flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REQUESTED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: null, disbursedAt: null
    });
    fixture.detectChanges();

    const chip: HTMLElement | null = fixture.nativeElement.querySelector('.submit-withdrawal__status-chip');
    expect(chip?.classList).toContain('submit-withdrawal__status-chip--requested');
    expect(fixture.nativeElement.querySelector('.submit-withdrawal__auto-approve-hint')).toBeFalsy();
  });

  it('shows a brand-tinted status chip and the auto-approve hint for an APPROVED (auto-approved) submission', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 100 });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/admin/withdrawals').flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 100, status: 'APPROVED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T00:00:00Z', disbursedAt: null
    });
    fixture.detectChanges();

    const chip: HTMLElement | null = fixture.nativeElement.querySelector('.submit-withdrawal__status-chip');
    expect(chip?.classList).toContain('submit-withdrawal__status-chip--approved');
    const hint: HTMLElement | null = fixture.nativeElement.querySelector('.submit-withdrawal__auto-approve-hint');
    expect(hint?.textContent?.trim()).toBeTruthy();
  });
});
