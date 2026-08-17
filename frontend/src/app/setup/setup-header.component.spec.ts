import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SetupHeaderComponent } from './setup-header.component';

describe('SetupHeaderComponent', () => {
  let fixture: ComponentFixture<SetupHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupHeaderComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SetupHeaderComponent);
  });

  it('reports 0% complete when there are no steps', () => {
    fixture.componentInstance.steps = [];
    expect(fixture.componentInstance.percentComplete).toBe(0);
  });

  it('computes the percentage of complete steps', () => {
    fixture.componentInstance.steps = [
      { number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 },
      { number: 2, key: 'branding', complete: false, required: true, percentComplete: 0 },
      { number: 3, key: 'compensation', complete: true, required: true, percentComplete: 100 },
      { number: 4, key: 'projects', complete: false, required: true, percentComplete: 0 }
    ];
    expect(fixture.componentInstance.percentComplete).toBe(50);
  });

  it('renders the header title', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-header__title')).toBeTruthy();
  });
});
