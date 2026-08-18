import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TeamSnapshotComponent } from './team-snapshot.component';

describe('TeamSnapshotComponent', () => {
  let fixture: ComponentFixture<TeamSnapshotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamSnapshotComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(TeamSnapshotComponent);
    fixture.componentInstance.data = {
      totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2,
      leftAssociates: 7, rightAssociates: 5
    };
    fixture.detectChanges();
  });

  it('renders downline size, active-today count, and new joins', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('12');
    expect(text).toContain('3');
    expect(text).toContain('2');
  });

  it('renders the left and right associate split', () => {
    const left = fixture.nativeElement.querySelector('.left-associates').textContent;
    const right = fixture.nativeElement.querySelector('.right-associates').textContent;
    expect(left).toContain('7');
    expect(right).toContain('5');
  });
});
