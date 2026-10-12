import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

export interface ReportFilterValue { from: string; to: string; projectId: string; }

@Component({
  selector: 'app-report-filters',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./report-filters.component.scss'],
  imports: [CommonModule, TranslateModule, FieldErrorComponent],
  template: `
    <div class="booking-register__filters report-filters">
      <label class="booking-register__field">{{ fromKey | translate }}
        <input name="from" type="date" [disabled]="locked" [value]="v.from" [attr.max]="v.to || null" (change)="set({ from: $any($event.target).value })" /></label>
      <label class="booking-register__field">{{ toKey | translate }}
        <input name="to" type="date" [disabled]="locked" [value]="v.to" [attr.min]="v.from || null" (change)="set({ to: $any($event.target).value })" /></label>
      <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.project' | translate }}
        <select name="projectId" [disabled]="locked" (change)="set({ projectId: $any($event.target).value })">
          <option value="" [selected]="!v.projectId">{{ 'admin.bookingsEmi.filter.allProjects' | translate }}</option>
          <option *ngFor="let p of projects" [value]="p.id" [selected]="v.projectId === p.id">{{ p.name }}</option>
        </select></label>
      <button type="button" class="brand-button brand-button--secondary report-filters__reset" [disabled]="locked" (click)="reset()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
      <app-field-error [message]="rangeError ? ('admin.bookingsEmi.validation.range' | translate) : undefined"></app-field-error>
    </div>
  `
})
export class ReportFiltersComponent implements OnInit {
  private projectsService = inject(ProjectsService);
  @Input() locked = false;
  @Input() fromKey = 'admin.bookingsEmi.filter.from';
  @Input() toKey = 'admin.bookingsEmi.filter.to';
  @Output() filtersChange = new EventEmitter<ReportFilterValue>();
  v: ReportFilterValue = { from: '', to: '', projectId: '' };
  projects: Project[] = [];
  rangeError = false;

  ngOnInit(): void { this.projectsService.listProjects().subscribe({ next: p => (this.projects = p), error: () => undefined }); }
  set(part: Partial<ReportFilterValue>): void {
    this.v = { ...this.v, ...part };
    this.rangeError = !!this.v.from && !!this.v.to && this.v.from > this.v.to; // ISO dates compare lexically
    if (!this.rangeError) { this.filtersChange.emit(this.v); }
  }
  reset(): void { this.v = { from: '', to: '', projectId: '' }; this.rangeError = false; this.filtersChange.emit(this.v); }
}
