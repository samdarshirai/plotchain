import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CompensationStepComponent } from './compensation-step.component';
import { SetupService } from '../../setup.service';
import { CompensationPlanResponse } from '../../models/compensation-plan.model';

describe('CompensationStepComponent', () => {
  let fixture: ComponentFixture<CompensationStepComponent>;
  let httpMock: HttpTestingController;
  let setupService: SetupService;

  const emptyPlan: CompensationPlanResponse = {
    versionLabel: 'v1',
    effectiveFrom: '2026-01-01',
    directIncomePct: 10,
    matchingIncomePct: 5,
    sponsorMatchingPct: 2,
    tdsPct: 2,
    adminChargeWithPanPct: 5,
    adminChargeWithoutPanPct: 15,
    activationFee: 1100,
    minWithdrawal: 100,
    settlementCycle: 'SEMI_MONTHLY',
    royaltyBonusRates: [{ rankId: 'rank-1', rankName: 'Bronze', royaltyPct: 1 }],
    rewardTiers: [
      { tierLevel: 1, volumeThreshold: 100000, cashReward: 1000, perkDescription: 'Certificate' },
      { tierLevel: 2, volumeThreshold: 200000, cashReward: 2000, perkDescription: 'Trophy' }
    ],
    availableRanks: [
      { id: 'rank-1', name: 'Bronze' },
      { id: 'rank-2', name: 'Silver' }
    ],
    createdAt: '2026-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompensationStepComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CompensationStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    setupService = TestBed.inject(SetupService);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/compensation').flush(emptyPlan);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('patches the stat-tiles/toggle-group/editable-tables from the loaded plan without triggering an autosave', fakeAsync(() => {
    const component = fixture.componentInstance;

    expect(component.form.value.directIncomePct).toBe(10);
    expect(component.form.value.settlementCycle).toBe('SEMI_MONTHLY');
    expect(component.royaltyRows).toEqual([{ rankId: 'rank-1', royaltyPct: 1 }]);
    expect(component.rewardTierRows).toEqual([
      { volumeThreshold: 100000, cashReward: 1000, perkDescription: 'Certificate' },
      { volumeThreshold: 200000, cashReward: 2000, perkDescription: 'Trophy' }
    ]);

    tick(500);
    httpMock.expectNone('/api/company/compensation');
  }));

  it('recomputes the Sample Earnings Preview synchronously on a stat-tile edit, and separately autosaves after 400ms', fakeAsync(() => {
    const finalEarningsEl: HTMLElement = fixture.nativeElement.querySelector('.compensation-step__final-earnings');
    const before = finalEarningsEl.textContent;
    const beforeValue = fixture.componentInstance.sampleEarnings?.finalEarnings;

    fixture.componentInstance.form.get('directIncomePct')?.setValue(50);
    fixture.detectChanges();

    // No tick() -- the undebounced valueChanges subscription recomputes synchronously.
    expect(fixture.componentInstance.sampleEarnings?.finalEarnings).not.toEqual(beforeValue);
    expect(finalEarningsEl.textContent).not.toEqual(before);

    httpMock.expectNone('/api/company/compensation');
    tick(400);
    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.method).toBe('PUT');
    req.flush({ ...emptyPlan, directIncomePct: 50 });
  }));

  it('autosaves from a table-only edit, sending royaltyBonusRates/rewardTiers with tierLevel derived by row index', fakeAsync(() => {
    const component = fixture.componentInstance;

    // No scalar field is touched here -- table row changes must independently drive the
    // debounced save (via rowsChanged$), since royaltyRows/rewardTierRows aren't form controls
    // and never flow through form.valueChanges.
    // Remove the first reward tier row -- the remaining row should shift from level 2 to 1.
    component.onRewardTierRowsChange([{ volumeThreshold: 200000, cashReward: 2000, perkDescription: 'Trophy' }]);
    component.onRoyaltyRowsChange([{ rankId: 'rank-2', royaltyPct: 3 }]);

    httpMock.expectNone('/api/company/compensation');
    tick(400);
    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.royaltyBonusRates).toEqual([{ rankId: 'rank-2', royaltyPct: 3 }]);
    expect(req.request.body.rewardTiers).toEqual([
      { tierLevel: 1, volumeThreshold: 200000, cashReward: 2000, perkDescription: 'Trophy' }
    ]);
    req.flush(emptyPlan);
  }));

  it("surfaces the backend's own message on a 409 rather than a hardcoded guess", fakeAsync(() => {
    fixture.componentInstance.form.get('directIncomePct')?.setValue(20);

    tick(400);
    httpMock.expectOne('/api/company/compensation').flush(
      { error: "A compensation plan version is already effective on 2026-07-30; it belongs to a different administrator's edit" },
      { status: 409, statusText: 'Conflict' }
    );

    // A 409 can now mean a tier gap, a non-increasing threshold, OR another admin owning
    // today's version -- only the server knows which, so its text must reach the banner intact.
    expect(fixture.componentInstance.submitError).toBe(
      "A compensation plan version is already effective on 2026-07-30; it belongs to a different administrator's edit"
    );
    expect(fixture.componentInstance.savedJustNow).toBeFalse();
  }));

  it('falls back to the generic message on a 409 with no error field in the body', fakeAsync(() => {
    fixture.componentInstance.form.get('directIncomePct')?.setValue(20);

    tick(400);
    httpMock.expectOne('/api/company/compensation').flush({}, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBe('setup.compensation.validation.genericSaveError');
  }));

  it('surfaces server-side field errors from a 400 via the existing toFieldErrors path', fakeAsync(() => {
    fixture.componentInstance.form.get('directIncomePct')?.setValue(20);

    tick(400);
    httpMock.expectOne('/api/company/compensation').flush(
      { error: 'validation failed', fields: { directIncomePct: 'must be between 0 and 100' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(fixture.componentInstance.fieldError('directIncomePct')).toBe('must be between 0 and 100');
    expect(fixture.componentInstance.savedJustNow).toBeFalse();
  }));

  it('sets a translated submitError on a 500 with no fields map, since it has nowhere else to render', fakeAsync(() => {
    fixture.componentInstance.form.get('directIncomePct')?.setValue(20);

    tick(400);
    httpMock.expectOne('/api/company/compensation').flush(
      { error: 'boom' },
      { status: 500, statusText: 'Server Error' }
    );

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.savedJustNow).toBeFalse();
  }));

  it('sets a translated submitError on a 400 keyed to a field with no visible field-error slot (settlementCycle)', fakeAsync(() => {
    fixture.componentInstance.form.get('directIncomePct')?.setValue(20);

    tick(400);
    httpMock.expectOne('/api/company/compensation').flush(
      { error: 'validation failed', fields: { settlementCycle: 'unsupported cycle' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.fieldError('directIncomePct')).toBeUndefined();
  }));

  it('does not autosave a blank reward-tier row from "+ Add", but does once it is filled in', fakeAsync(() => {
    const component = fixture.componentInstance;
    const existingRows = component.rewardTierRows;

    // What editable-table emits when "+ Add" is clicked: the existing rows plus a blank one.
    // volumeThreshold 0 fails the backend's @DecimalMin("0.01"), so saving now is guaranteed
    // to error out on nothing more than the act of adding a row.
    const blankRow = { volumeThreshold: 0, cashReward: 0, perkDescription: '' };
    component.onRewardTierRowsChange([...existingRows, blankRow]);

    // Local state and the preview still update immediately -- only the save is gated.
    expect(component.rewardTierRows.length).toBe(existingRows.length + 1);
    tick(400);
    httpMock.expectNone('/api/company/compensation');

    // Filling the row in makes the next edit save normally.
    component.onRewardTierRowsChange([
      ...existingRows,
      { volumeThreshold: 300000, cashReward: 3000, perkDescription: 'Cruise' }
    ]);
    tick(400);
    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.rewardTiers.length).toBe(3);
    req.flush(emptyPlan);
  }));

  it('does not autosave a blank royalty row with no rank selected, but does once a rank is picked', fakeAsync(() => {
    const component = fixture.componentInstance;

    // rankId '' would fail UUID deserialization server-side with a confusing generic error.
    component.onRoyaltyRowsChange([...component.royaltyRows, { rankId: '', royaltyPct: 0 }]);
    tick(400);
    httpMock.expectNone('/api/company/compensation');

    // 0% is a legitimate royalty rate -- only the missing rank made the row incomplete.
    component.onRoyaltyRowsChange([...component.royaltyRows.slice(0, 1), { rankId: 'rank-2', royaltyPct: 0 }]);
    tick(400);
    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.body.royaltyBonusRates).toEqual([
      { rankId: 'rank-1', royaltyPct: 1 },
      { rankId: 'rank-2', royaltyPct: 0 }
    ]);
    req.flush(emptyPlan);
  }));

  it('blocks autosave entirely when the initial plan load fails, so defaults are never written back', fakeAsync(() => {
    const failedFixture = TestBed.createComponent(CompensationStepComponent);
    failedFixture.detectChanges();
    httpMock
      .expectOne('/api/company/compensation')
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    const component = failedFixture.componentInstance;
    expect(component.loadFailed).toBeTrue();
    expect(component.submitError).toBe('setup.compensation.validation.loadFailed');

    // Editing after a failed load must not PUT the constructor-default zeros over the real plan.
    component.form.get('directIncomePct')?.setValue(20);
    tick(400);
    httpMock.expectNone('/api/company/compensation');

    failedFixture.destroy();
  }));

  it('calls setupService.refresh() only on a successful save', fakeAsync(() => {
    spyOn(setupService, 'refresh');

    fixture.componentInstance.form.get('directIncomePct')?.setValue(30);
    tick(400);
    httpMock.expectOne('/api/company/compensation').flush(
      { error: 'boom' },
      { status: 500, statusText: 'Server Error' }
    );
    expect(setupService.refresh).not.toHaveBeenCalled();

    fixture.componentInstance.form.get('directIncomePct')?.setValue(40);
    tick(400);
    httpMock.expectOne('/api/company/compensation').flush({ ...emptyPlan, directIncomePct: 40 });

    expect(setupService.refresh).toHaveBeenCalled();
  }));
});
