import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldErrorComponent } from '../field-error/field-error.component';

export type LogoVariant = 'square' | 'wide';

export const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

@Component({
  selector: 'app-logo-uploader',
  standalone: true,
  imports: [CommonModule, FieldErrorComponent],
  template: `
    <div class="logo-uploader">
      <label>{{ label }}</label>
      <div class="logo-uploader__tile" [class.logo-uploader__tile--filled]="hasLogo">
        <img *ngIf="hasLogo" [src]="logoUrl" class="logo-uploader__preview" alt="" />
        <span *ngIf="!hasLogo" class="logo-uploader__placeholder">{{ placeholderText }}</span>
      </div>
      <button type="button" class="logo-uploader__action" (click)="fileInput.click()">
        {{ hasLogo ? changeLabel : uploadLabel }}
      </button>
      <input
        #fileInput
        type="file"
        class="logo-uploader__input"
        [attr.accept]="acceptTypes"
        (change)="onFileSelected($event)"
      />
      <app-field-error [message]="error"></app-field-error>
    </div>
  `
})
export class LogoUploaderComponent {
  @Input() label = '';
  @Input() variant: LogoVariant = 'square';
  @Input() hasLogo = false;
  @Input() logoUrl = '';
  @Input() placeholderText = '';
  @Input() uploadLabel = '';
  @Input() changeLabel = '';
  @Input() error?: string;
  @Output() fileSelected = new EventEmitter<File>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly acceptTypes = ALLOWED_LOGO_MIME_TYPES.join(',');

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.fileSelected.emit(file);
    }
    // Reset so re-picking the identical filename still fires a change event.
    input.value = '';
  }
}
