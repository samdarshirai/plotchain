-- Role-capability unit 8: associate-facing KYC document submission
-- (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
-- KYC row: "Own KYC submission + status only" -- the write half of KYC, alongside the existing
-- admin-only review queue in KycReviewController/KycReviewService). One row per
-- (associate, document type): resubmitting a given type overwrites the existing row rather
-- than accumulating history, matching V7's CompanyBranding logo-overwrite convention.
CREATE TABLE associate_kyc_document (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    document_type VARCHAR(50) NOT NULL,
    content BYTEA NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL,
    UNIQUE (associate_id, document_type)
);
CREATE INDEX idx_associate_kyc_document_associate_id ON associate_kyc_document(associate_id);
