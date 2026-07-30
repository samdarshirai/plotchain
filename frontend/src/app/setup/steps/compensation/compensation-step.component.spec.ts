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

  it('sends royaltyBonusRates/rewardTiers reflecting current row state, with tierLevel derived by row index', fakeAsync(() => {
    const component = fixture.componentInstance;

    // Remove the first reward tier row -- the remaining row should shift from level 2 to 1.
    component.onRewardTierRowsChange([{ volumeThreshold: 200000, cashReward: 2000, perkDescription: 'Trophy' }]);
    component.onRoyaltyRowsChange([{ rankId: 'rank-2', royaltyPct: 3 }]);
    // Row edits alone don't drive the debounced-save subscription (it watches form.valueChanges,
    // matching branding's pattern); a scalar field edit is what triggers the save here, and it
    // picks up the current row state at save time.
    component.form.get('directIncomePct')?.setValue(20);

    tick(400);
    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.body.royaltyBonusRates).toEqual([{ rankId: 'rank-2', royaltyPct: 3 }]);
    expect(req.request.body.rewardTiers).toEqual([
      { tierLevel: 1, volumeThreshold: 200000, cashReward: 2000, perkDescription: 'Trophy' }
    ]);
    req.flush(emptyPlan);
  }));

  it('sets a translated submitError on a 409 and leaves savedJustNow false', fakeAsync(() => {
    fixture.componentInstance.form.get('directIncomePct')?.setValue(20);

    tick(400);
    httpMock.expectOne('/api/company/compensation').flush(
      { error: 'Reward tiers have a gap at level 2' },
      { status: 409, statusText: 'Conflict' }
    );

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.savedJustNow).toBeFalse();
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
