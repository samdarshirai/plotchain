CREATE TABLE news (
    id UUID PRIMARY KEY,
    news_date DATE NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_news_date ON news(news_date DESC);

ALTER TABLE settings_audit_log DROP CONSTRAINT chk_settings_audit_log_section;
ALTER TABLE settings_audit_log ADD CONSTRAINT chk_settings_audit_log_section CHECK (section IN (
    'COMPANY_PROFILE', 'BRANDING', 'COMPENSATION', 'PROJECTS',
    'PAYMENTS_KYC', 'ADMIN_TEAM', 'ROOT_ASSOCIATES',
    'KYC', 'ASSOCIATE', 'WITHDRAWAL', 'WALLET',
    'SUPPORT_TICKET', 'ADMIN_USERS', 'MASTER_PROJECTS', 'NEWS'
));
