export interface StepStatus {
  number: number;
  key: string;
  complete: boolean;
  required: boolean;
  percentComplete: number;
}

export interface SetupStateResponse {
  steps: StepStatus[];
  canGoLive: boolean;
  launchedAt: string | null;
}

export interface LaunchRequest {
  acceptTerms: boolean;
}

// The backend's step key (camelCase, matches SetupStateService's StepDefinition list) differs
// from its route segment (kebab-case). Both must be extended together when a step is added.
export const STEP_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  rootAssociates: 'root-associates',
  reviewLaunch: 'review-launch'
};
