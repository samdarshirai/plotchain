import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ReviewLaunchStepComponent } from './review-launch-step.component';
import { ChecklistRowComponent } from '../../../shared/components/checklist-row/checklist-row.component';
import { BrandButtonComponent } from '../../../shared/components/brand-button/brand-button.component';
import { SetupService } from '../../setup.service';
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
        step({ number: 6, key: 'adminTeam', required: false, complete: false }),
        step({ number: 7, key: 'rootAssociates', required: false, complete: false }),
        step({ number: 8, key: 'reviewLaunch', required: false, complete: false })
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
    expect(rows.length).toBe(7);
    expect(rows.map(r => r.componentInstance.label)).not.toContain('reviewLaunch');
  });

  it('disables Go Live when canGoLive is false, even with terms accepted', async () => {
    await createAndFlush(stateWith(false));
    fixture.componentInstance.termsAccepted = true;
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.directive(BrandButtonComponent));
    expect(button.componentInstance.disabled).toBeTrue();
  });

  it('disables Go Live when canGoLive is true but terms are not accepted', async () => {
    await createAndFlush(stateWith(true));

    const button = fixture.debugElement.query(By.directive(BrandButtonComponent));
    expect(button.componentInstance.disabled).toBeTrue();
  });

  it('enables Go Live and posts to /api/company/launch when both conditions are met', async () => {
    await createAndFlush(stateWith(true));
    fixture.componentInstance.termsAccepted = true;
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.directive(BrandButtonComponent));
    expect(button.componentInstance.disabled).toBeFalse();

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
});
