import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Project, ProjectRequest } from '../../setup/models/project.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FieldErrorComponent],
  template: `
    <form class="project-form" (submit)="submit($event)" novalidate>
      <h2 class="plot-form__title">{{ (project ? 'admin.projectsPlots.editProjectAction' : 'admin.projectsPlots.addProjectAction') | translate }}</h2>
      <label>{{ 'admin.projectsPlots.nameLabel' | translate }}
        <input type="text" name="name" maxlength="200" [(ngModel)]="name" [attr.aria-invalid]="tried && !name.trim()" />
        <app-field-error [message]="(tried && !name.trim() ? 'admin.projectsPlots.error.generic' : '') | translate"></app-field-error>
      </label>
      <label>{{ 'admin.projectsPlots.locationLabel' | translate }}
        <input type="text" name="location" maxlength="200" [(ngModel)]="location" [attr.aria-invalid]="tried && !location.trim()" />
        <app-field-error [message]="(tried && !location.trim() ? 'admin.projectsPlots.error.generic' : '') | translate"></app-field-error>
      </label>
      <label>{{ 'admin.projectsPlots.photoLabel' | translate }}
        <input type="file" name="photo" accept="image/*" (change)="photo = $any($event.target).files?.[0] ?? null" />
      </label>
      <div class="projects-plots__form-actions">
        <button type="submit" class="brand-button" [disabled]="busy">{{ 'admin.projectsPlots.saveProjectAction' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" (click)="cancelled.emit()">{{ 'admin.projectsPlots.cancelAction' | translate }}</button>
      </div>
    </form>
  `
})
export class ProjectFormComponent implements OnChanges {
  @Input() project: Project | null = null;
  @Input() busy = false;
  @Output() submitted = new EventEmitter<{ request: ProjectRequest; photo: File | null }>();
  @Output() cancelled = new EventEmitter<void>();

  name = '';
  location = '';
  photo: File | null = null;
  tried = false;

  ngOnChanges(c: SimpleChanges): void {
    if (c['project'] && this.project) {
      this.name = this.project.name;
      this.location = this.project.location;
    }
  }

  submit(e: Event): void {
    e.preventDefault();
    this.tried = true;
    if (!this.name.trim() || !this.location.trim()) { return; }
    this.submitted.emit({ request: { name: this.name.trim(), location: this.location.trim() }, photo: this.photo });
  }
}
