import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RootUserStepComponent } from './root-user-step.component';
import { SetupStateResponse } from '../../models/setup-state.model';

describe('RootUserStepComponent', () => {
  let fixture: ComponentFixture<RootUserStepComponent>;
  let httpMock: HttpTestingController;

  function state(rootDone: boolean): SetupStateResponse {
    return {
      steps: [
        { number: 6, key: 'rootUser', complete: rootDone, required: true, percentComplete: rootDone ? 100 : 0 },
        { number: 7, key: 'reviewLaunch', complete: false, required: false, percentComplete: 0 }
      ],
      canGoLive: false,
      launchedAt: null
    };
  }

  async function create(rootDone: boolean): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RootUserStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RootUserStepComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/company/setup-state').flush(state(rootDone));
    fixture.detectChanges();
  }

  it('offers to create the root user until one exists, and blocks Next', async () => {
    await create(false);
    expect(fixture.nativeElement.querySelector('app-brand-button')).not.toBeNull();
    expect(fixture.componentInstance.isStepValid()).toBeFalse();
  });

  it('shows the done banner and allows Next once the root user exists', async () => {
    await create(true);
    expect(fixture.nativeElement.querySelector('app-brand-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-inline-banner')).not.toBeNull();
    expect(fixture.componentInstance.isStepValid()).toBeTrue();
  });
});
