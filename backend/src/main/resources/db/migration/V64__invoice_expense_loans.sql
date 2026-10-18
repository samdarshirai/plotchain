CREATE TABLE expense (
    id UUID PRIMARY KEY,
    expense_date DATE NOT NULL,
    expense_type_id UUID NOT NULL REFERENCES expense_type(id),
    project_id UUID REFERENCES project(id),
    pay_to VARCHAR(150) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    pay_mode VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    txn_no VARCHAR(100),
    remarks VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_expense_amount CHECK (amount > 0),
    CONSTRAINT chk_expense_pay_mode CHECK (pay_mode IN ('CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'))
);
CREATE INDEX idx_expense_date ON expense (expense_date);

CREATE TABLE advance_loan (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    loan_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    previous_dues NUMERIC(14,2) NOT NULL DEFAULT 0,
    pay_mode VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    instrument_no VARCHAR(100),
    remarks VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_advance_loan_amount CHECK (amount > 0),
    CONSTRAINT chk_advance_loan_pay_mode CHECK (pay_mode IN ('CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'))
);
CREATE INDEX idx_advance_loan_associate ON advance_loan (associate_id);

CREATE SEQUENCE loan_repayment_receipt_seq START 1;

CREATE TABLE loan_repayment (
    id UUID PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES advance_loan(id),
    receipt_no VARCHAR(20) NOT NULL,
    payment_date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    pay_mode VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    txn_no VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_loan_repayment_amount CHECK (amount > 0),
    CONSTRAINT chk_loan_repayment_pay_mode CHECK (pay_mode IN ('CASH', 'CHEQUE', 'DD', 'UPI', 'BANK_TRANSFER'))
);
CREATE UNIQUE INDEX uq_loan_repayment_receipt_no ON loan_repayment (receipt_no);
CREATE INDEX idx_loan_repayment_loan ON loan_repayment (loan_id);
CREATE INDEX idx_loan_repayment_date ON loan_repayment (payment_date);

ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS', 'MASTER_PROJECTS', 'NEWS', 'EXPENSE_TYPES',
    'IMPERSONATION',
    'EXPENSE', 'ADVANCE_LOAN', 'LOAN_REPAYMENT'
));
