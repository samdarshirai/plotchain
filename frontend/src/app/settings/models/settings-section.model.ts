// The five setup-wizard steps that are also editable as settings screens, mapped to their route
// segment. This is the audit log's section vocabulary, not the nav's -- every navigable settings
// screen (these five plus the other nine) lives in ADMIN_NAV_CATEGORIES instead.
export const SECTION_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc'
  // auditLog deliberately absent: it isn't a wrapped step component, so it has no entry here.
};
