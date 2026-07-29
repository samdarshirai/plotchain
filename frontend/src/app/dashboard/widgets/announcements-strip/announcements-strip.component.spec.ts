import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnnouncementsStripComponent } from './announcements-strip.component';

describe('AnnouncementsStripComponent', () => {
  let fixture: ComponentFixture<AnnouncementsStripComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnnouncementsStripComponent] }).compileComponents();
    fixture = TestBed.createComponent(AnnouncementsStripComponent);
    fixture.componentInstance.announcements = [
      { id: 'a1', title: 'New Project Launch: Green Valley', publishedAt: '2026-07-20T00:00:00Z' }
    ];
    fixture.detectChanges();
  });

  it('renders one .announcement element per announcement', () => {
    const items = fixture.nativeElement.querySelectorAll('.announcement');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Green Valley');
  });
});
