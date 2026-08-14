import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ReviewLaunchStepComponent } from './review-launch-step.component';
import { ChecklistRowComponent } from '../../../shared/components/checklist-row/checklist-row.component';
import { SetupService } from '../../setup.service';
import { SetupInspectorService } from '../../setup-inspector.service';
import { SetupStateResponse, StepStatus } from '../../models/setup-state.model';

describe('ReviewLaunchStepComponent', () => {
  let fixture: ComponentFixture<ReviewLaunchStepComponent>;
  let httpMock: HttpTestingController;
  let setupService: SetupService;

  function step(overrides: Partial<StepStatus>): StepStatus {
    return { number: 1, key: 'companyProfile', complete: false, required: true, percentComplete: 0, ...overrides };
  }

  function stateWith(canGoLive: boolean): SetupStateResponse {
    return {
      steps: [
        step({ number: 1, key: 'companyProfile', required: true, complete: canGoLive }),
        step({ number: 2, key: 'branding', required: false, complete: false }),
        step({ number: 3, key: 'compensation', required: true, complete: canGoLive }),
        step({ number: 4, key: 'projects', required: false, complete: false }),
        step({ number: 5, key: 'paymentsKyc', required: true, complete: canGoLive }),
        step({ number: 6, key: 'reviewLaunch', required: false, complete: false })
      ],
      canGoLive,
      launchedAt: null
    };
  }

  async function createAndFlush(state: SetupStateResponse): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReviewLaunchStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewLaunchStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    setupService = TestBed.inject(SetupService);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/setup-state').flush(state);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('renders one checklist row per step, excluding review-launch itself', async () => {
    await createAndFlush(stateWith(false));

    const rows = fixture.debugElement.queryAll(By.directive(ChecklistRowComponent));
    expect(rows.length).toBe(5);
    expect(rows.map(r => r.componentInstance.label)).not.toContain('reviewLaunch');
  });

  it('gives a complete row the complete tone and an incomplete required row the blocking tone', async () => {
    await createAndFlush(stateWith(false));

    const rows = fixture.debugElement.queryAll(By.directive(ChecklistRowComponent));
    const companyProfileRow = rows.find(r => r.componentInstance.editHref === '/setup/company-profile');
    const brandingRow = rows.find(r => r.componentInstance.editHref === '/setup/branding');

    expect(companyProfileRow?.componentInstance.tone).toBe('blocking');
    expect(brandingRow?.componentInstance.tone).toBe('optional');
  });

  it('gives a complete step the complete tone', async () => {
    await createAndFlush(stateWith(true));

    const rows = fixture.debugElement.queryAll(By.directive(ChecklistRowComponent));
    const companyProfileRow = rows.find(r => r.componentInstance.editHref === '/setup/company-profile');
    expect(companyProfileRow?.componentInstance.tone).toBe('complete');
  });

  it('disables Go Live when canGoLive is false, even with terms accepted', async () => {
    await createAndFlush(stateWith(false));
    fixture.componentInstance.termsAccepted = true;

    expect(fixture.componentInstance.goLiveDisabled(stateWith(false))).toBeTrue();
  });

  it('disables Go Live when canGoLive is true but terms are not accepted', async () => {
    await createAndFlush(stateWith(true));

    expect(fixture.componentInstance.goLiveDisabled(stateWith(true))).toBeTrue();
  });

  it('enables Go Live and posts to /api/company/launch when both conditions are met', async () => {
    await createAndFlush(stateWith(true));
    fixture.componentInstance.termsAccepted = true;

    expect(fixture.componentInstance.goLiveDisabled(stateWith(true))).toBeFalse();

    fixture.componentInstance.goLive();
    const req = httpMock.expectOne('/api/company/launch');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ acceptTerms: true });
    req.flush({ ...stateWith(true), launchedAt: '2026-01-01T00:00:00Z' });
    // A successful launch calls setupService.refresh(), which re-fetches setup-state.
    httpMock.expectOne('/api/company/setup-state').flush({ ...stateWith(true), launchedAt: '2026-01-01T00:00:00Z' });

    expect(fixture.componentInstance.launched).toBeTrue();
  });

  it('refreshes the setup state after a successful launch', async () => {
    await createAndFlush(stateWith(true));
    fixture.componentInstance.termsAccepted = true;
    spyOn(setupService, 'refresh').and.callThrough();

    fixture.componentInstance.goLive();
    httpMock.expectOne('/api/company/launch').flush({ ...stateWith(true), launchedAt: '2026-01-01T00:00:00Z' });
    httpMock.expectOne('/api/company/setup-state').flush({ ...stateWith(true), launchedAt: '2026-01-01T00:00:00Z' });

    expect(setupService.refresh).toHaveBeenCalled();
  });

  it('surfaces a 409 launch-blocked error without throwing', async () => {
    await createAndFlush(stateWith(true));
    fixture.componentInstance.termsAccepted = true;

    fixture.componentInstance.goLive();
    httpMock.expectOne('/api/company/launch').flush(
      { error: 'Cannot go live until required steps are complete: [paymentsKyc]', incompleteSteps: ['paymentsKyc'] },
      { status: 409, statusText: 'Conflict' }
    );

    expect(fixture.componentInstance.launched).toBeFalse();
    expect(fixture.componentInstance.launchError).toContain('Cannot go live');
  });

  it('resolves previousPath to the step before review-launch', async () => {
    await createAndFlush(stateWith(false));
    expect(fixture.componentInstance.previousPath).toBe('payments-kyc');
  });

  it('registers its inspector panel template with SetupInspectorService after view init', async () => {
    await createAndFlush(stateWith(false));
    const inspectorService = TestBed.inject(SetupInspectorService);
    spyOn(inspectorService, 'register');

    fixture.componentInstance.ngAfterViewInit();

    expect(inspectorService.register).toHaveBeenCalled();
  });

  it('clears the inspector template on destroy', async () => {
    await createAndFlush(stateWith(false));
    const inspectorService = TestBed.inject(SetupInspectorService);
    spyOn(inspectorService, 'clear');

    fixture.destroy();

    expect(inspectorService.clear).toHaveBeenCalled();
  });
});
