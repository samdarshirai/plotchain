import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnnouncementSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-announcements-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="announcements-strip">
      <div class="announcement" *ngFor="let a of announcements">{{ a.title }}</div>
    </div>
  `
})
export class AnnouncementsStripComponent {
  @Input() announcements: AnnouncementSummary[] = [];
}
