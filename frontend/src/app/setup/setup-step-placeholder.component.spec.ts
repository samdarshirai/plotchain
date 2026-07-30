import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SetupStepPlaceholderComponent } from './setup-step-placeholder.component';

describe('SetupStepPlaceholderComponent', () => {
  let fixture: ComponentFixture<SetupStepPlaceholderComponent>;

  async function createWithStepKey(stepKey: string): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SetupStepPlaceholderComponent, TranslateModule.forRoot()],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { data: { stepKey } } } }]
    }).compileComponents();
    fixture = TestBed.createComponent(SetupStepPlaceholderComponent);
    fixture.detectChanges();
  }

  it('reads the step key from route data', async () => {
    await createWithStepKey('branding');
    expect(fixture.componentInstance.stepKey).toBe('branding');
  });

  it('renders a heading and a coming-soon note', async () => {
    await createWithStepKey('companyProfile');
    expect(fixture.nativeElement.querySelector('h1')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('p')).toBeTruthy();
  });
});
