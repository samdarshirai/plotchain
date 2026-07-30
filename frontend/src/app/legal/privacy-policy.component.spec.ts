import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PrivacyPolicyComponent } from './privacy-policy.component';

describe('PrivacyPolicyComponent', () => {
  let fixture: ComponentFixture<PrivacyPolicyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivacyPolicyComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PrivacyPolicyComponent);
    fixture.detectChanges();
  });

  it('renders a heading and body text', () => {
    expect(fixture.nativeElement.querySelector('h1')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('p')).toBeTruthy();
  });
});
