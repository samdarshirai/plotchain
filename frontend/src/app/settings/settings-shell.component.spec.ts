import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsShellComponent } from './settings-shell.component';

describe('SettingsShellComponent', () => {
  let fixture: ComponentFixture<SettingsShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsShellComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsShellComponent);
    fixture.detectChanges();
  });

  it('renders a coming-soon placeholder', () => {
    expect(fixture.nativeElement.querySelector('.settings-shell')).toBeTruthy();
  });
});
