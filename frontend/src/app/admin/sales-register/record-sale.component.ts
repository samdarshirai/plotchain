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
            <select (change)="onProjectChange($any($event.target).value)">
              <option value="">{{ 'admin.recordSale.projectPlaceholder' | translate }}</option>
              <option *ngFor="let project of projects" [value]="project.id">{{ project.name }}</option>
            </select>
          </div>
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.plotLabel' | translate }}</label>
            <select formControlName="plotId" (blur)="markTouched('plotId')">
              <option value="">{{ 'admin.recordSale.plotPlaceholder' | translate }}</option>
              <option *ngFor="let plot of availablePlots" [value]="plot.id">{{ plot.plotNo }} — {{ plot.price }}</option>
            </select>
            <app-field-error [message]="fieldError('plotId')"></app-field-error>
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
            <label>{{ 'admin.recordSale.buyerPhoneLabel' | translate }}</label>
            <input type="text" formControlName="buyerPhone" (blur)="markTouched('buyerPhone')" />
            <app-field-error [message]="fieldError('buyerPhone')"></app-field-error>
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
    plotId: ['', Validators.required],
    associateId: ['', Validators.required],
    buyerName: ['', Validators.required],
    buyerPhone: ['', Validators.required],
    buyerEmail: ['']
  });

  recorded: Sale | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  projects: Project[] = [];
  availablePlots: Plot[] = [];
  private selectedProjectId = '';
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
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
    return undefined;
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { plotId, associateId, buyerName, buyerPhone, buyerEmail } = this.form.getRawValue();
    this.salesRegisterService
      .record({ plotId, associateId, buyerName, buyerPhone, buyerEmail: buyerEmail || undefined })
      .subscribe({
        next: sale => {
          this.recorded = sale;
          this.serverFieldErrors = {};
          this.submitError = null;
          this.form.reset();
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
