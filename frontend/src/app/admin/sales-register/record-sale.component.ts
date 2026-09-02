import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesRegisterService } from './sales-register.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Project, Plot } from '../../setup/models/project.model';
import { Sale } from '../models/sale.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';

const PLOT_PAGE_SIZE = 100;

@Component({
  selector: 'app-record-sale',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent, BrandButtonComponent],
  template: `
    <div class="record-sale">
      <div class="record-sale__intro">
        <h1 class="record-sale__title">{{ 'admin.recordSale.title' | translate }}</h1>
        <p class="record-sale__subtitle">{{ 'admin.recordSale.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="recorded" tone="success">
        <p>{{ 'admin.recordSale.successSaleIdLabel' | translate }}: <strong>{{ recorded.id }}</strong></p>
        <p>{{ 'admin.recordSale.successBuyerLabel' | translate }}: <strong>{{ recorded.buyerName }}</strong></p>
        <p>{{ 'admin.recordSale.successAmountLabel' | translate }}: <strong>{{ recorded.amount }}</strong></p>
        <app-brand-button type="button" variant="secondary" (clicked)="dismissBanner()">
          {{ 'admin.recordSale.recordAnotherButton' | translate }}
        </app-brand-button>
      </app-inline-banner>

      <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

      <form class="card record-sale__form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.projectLabel' | translate }}</label>
            <select formControlName="projectId" (change)="onProjectChange($any($event.target).value)" (blur)="markTouched('projectId')">
              <option value="">{{ 'admin.recordSale.projectPlaceholder' | translate }}</option>
              <option *ngFor="let project of projects" [value]="project.id">{{ project.name }}</option>
            </select>
            <app-field-error [message]="fieldError('projectId')"></app-field-error>
          </div>
          <div class="record-sale__field">
            <div class="record-sale__field-header">
              <label>{{ 'admin.recordSale.plotLabel' | translate }}</label>
              <span class="record-sale__optional-tag">{{ 'admin.recordSale.optionalTagLabel' | translate }}</span>
            </div>
            <select formControlName="plotId">
              <option value="">{{ 'admin.recordSale.plotPlaceholder' | translate }}</option>
              <option *ngFor="let plot of availablePlots" [value]="plot.id">{{ plot.plotNo }} — {{ plot.price }}</option>
            </select>
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.associateLabel' | translate }}</label>
            <select formControlName="associateId" (blur)="markTouched('associateId')">
              <option value="">{{ 'admin.recordSale.associatePlaceholder' | translate }}</option>
              <option *ngFor="let associate of associates" [value]="associate.id">
                {{ associate.userId }} — {{ associate.name }}
              </option>
            </select>
            <app-field-error [message]="fieldError('associateId')"></app-field-error>
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.buyerNameLabel' | translate }}</label>
            <input type="text" formControlName="buyerName" (blur)="markTouched('buyerName')" />
            <app-field-error [message]="fieldError('buyerName')"></app-field-error>
          </div>
          <div class="record-sale__field">
            <div class="record-sale__field-header">
              <label>{{ 'admin.recordSale.buyerPhoneLabel' | translate }}</label>
              <span class="record-sale__optional-tag">{{ 'admin.recordSale.optionalTagLabel' | translate }}</span>
            </div>
            <input type="text" formControlName="buyerPhone" />
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <div class="record-sale__field-header">
              <label>{{ 'admin.recordSale.buyerEmailLabel' | translate }}</label>
              <span class="record-sale__optional-tag">{{ 'admin.recordSale.optionalTagLabel' | translate }}</span>
            </div>
            <input type="email" formControlName="buyerEmail" />
          </div>
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.priceLabel' | translate }}</label>
            <input type="number" step="0.01" min="0.01" formControlName="price" (blur)="markTouched('price')" />
            <app-field-error [message]="fieldError('price')"></app-field-error>
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.noteLabel' | translate }}</label>
            <textarea formControlName="note" (blur)="markTouched('note')"></textarea>
            <app-field-error [message]="fieldError('note')"></app-field-error>
          </div>
        </div>

        <div class="record-sale__actions">
          <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
            {{ 'admin.recordSale.submitButton' | translate }}
          </app-brand-button>
        </div>
      </form>
    </div>
  `
})
export class RecordSaleComponent implements OnInit {
  private fb = inject(FormBuilder);
  private salesRegisterService = inject(SalesRegisterService);
  private adminService = inject(AdminService);
  private projectsService = inject(ProjectsService);
  private translate = inject(TranslateService);

  form = this.fb.nonNullable.group({
    projectId: ['', Validators.required],
    plotId: [''],
    associateId: ['', Validators.required],
    buyerName: ['', Validators.required],
    buyerPhone: [''],
    buyerEmail: [''],
    price: ['', [Validators.required, Validators.min(0.01)]],
    note: ['', Validators.required]
  });

  recorded: Sale | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  projects: Project[] = [];
  availablePlots: Plot[] = [];
  private selectedProjectId = '';
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(
      associates => (this.associates = associates.filter(a => a.role !== 'ADMIN'))
    );
    this.projectsService.listProjects().subscribe(projects => (this.projects = projects));
  }

  onProjectChange(projectId: string): void {
    this.selectedProjectId = projectId;
    this.availablePlots = [];
    this.form.patchValue({ plotId: '' });
    if (!projectId) {
      return;
    }
    this.projectsService.listPlots(projectId, 0, PLOT_PAGE_SIZE).subscribe(page => {
      this.availablePlots = page.plots.filter(plot => plot.status === 'AVAILABLE');
    });
  }

  markTouched(name: string): void {
    this.form.get(name)?.markAsTouched();
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('admin.recordSale.validation.required');
    }
    if (control.errors['min']) {
      return this.translate.instant('admin.recordSale.validation.priceInvalid');
    }
    return undefined;
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { projectId, plotId, associateId, buyerName, buyerPhone, buyerEmail, price, note } = this.form.getRawValue();
    this.salesRegisterService
      .record({
        projectId,
        plotId: plotId || undefined,
        associateId,
        buyerName,
        buyerPhone: buyerPhone || undefined,
        buyerEmail: buyerEmail || undefined,
        price: Number(price),
        note
      })
      .subscribe({
        next: sale => {
          this.recorded = sale;
          this.serverFieldErrors = {};
          this.submitError = null;
          this.form.reset();
          // projectId is a bound control now, so reset() blanks it like every other field --
          // re-patch it back to keep the project selection sticky across "record another", same
          // UX as before projectId was a real formControlName.
          this.form.patchValue({ projectId: this.selectedProjectId });
          this.onProjectChange(this.selectedProjectId);
        },
        error: (err: HttpErrorResponse) => {
          this.recorded = null;
          const fields = toFieldErrors(err);
          if (Object.keys(fields).length > 0) {
            this.serverFieldErrors = fields;
            return;
          }
          if (err.status === 409) {
            this.submitError = this.translate.instant('admin.recordSale.validation.plotUnavailable');
          } else {
            this.submitError = this.translate.instant('admin.recordSale.validation.genericSaveError');
          }
        }
      });
  }

  dismissBanner(): void {
    this.recorded = null;
  }
}
