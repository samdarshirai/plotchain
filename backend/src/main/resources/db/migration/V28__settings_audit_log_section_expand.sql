-- KycReviewService, AdminAssociateService, WithdrawalService, and WalletCreditingService each
-- call SettingsAuditService.record(...) with a section string that was never added to V12's
-- allow-list ("kyc"/"associate"/"withdrawal"/"wallet" vs. the seven settings-nav keys) --
-- the CHECK constraint rejected every one of those inserts with a DataIntegrityViolationException,
-- surfaced to callers as a generic 409. These four flows aren't settings-nav mutations at all
-- (they're KYC decisions, associate admin actions, withdrawal processing, and wallet crediting),
-- so rather than force them onto an existing settings-nav section, extend the allow-list with a
-- dedicated value per flow.
ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET'
));
