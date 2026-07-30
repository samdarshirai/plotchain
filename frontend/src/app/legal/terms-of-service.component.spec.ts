import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TermsOfServiceComponent } from './terms-of-service.component';

describe('TermsOfServiceComponent', () => {
  let fixture: ComponentFixture<TermsOfServiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TermsOfServiceComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(TermsOfServiceComponent);
    fixture.detectChanges();
  });

  it('renders a heading and body text', () => {
    expect(fixture.nativeElement.querySelector('h1')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('p')).toBeTruthy();
  });
});
