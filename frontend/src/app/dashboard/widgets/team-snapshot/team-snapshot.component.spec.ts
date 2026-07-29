import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamSnapshotComponent } from './team-snapshot.component';

describe('TeamSnapshotComponent', () => {
  let fixture: ComponentFixture<TeamSnapshotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TeamSnapshotComponent] }).compileComponents();
    fixture = TestBed.createComponent(TeamSnapshotComponent);
    fixture.componentInstance.data = { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2 };
    fixture.detectChanges();
  });

  it('renders downline size, active-today count, and new joins', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('12');
    expect(text).toContain('3');
    expect(text).toContain('2');
  });
});
