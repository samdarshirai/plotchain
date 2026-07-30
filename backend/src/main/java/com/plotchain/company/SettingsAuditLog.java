package com.plotchain.company;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

// Append-only ledger row: no setters exposed, mirroring CompensationPlanVersion. Every settings
// mutation inserts exactly one new row via SettingsAuditService.record(...); there is
// deliberately no update/delete path anywhere in this codebase.
@Entity
@Table(name = "settings_audit_log")
public class SettingsAuditLog {
    @Id
    private UUID id;
    @Column(name = "changed_by_associate_id")
    private UUID changedByAssociateId;
    private String section;
    private String summary;
    private String detail;
    @Column(name = "changed_at")
    private Instant changedAt;

    protected SettingsAuditLog() {}

    public SettingsAuditLog(UUID id, UUID changedByAssociateId, String section, String summary, String detail, Instant changedAt) {
        this.id = id;
        this.changedByAssociateId = changedByAssociateId;
        this.section = section;
        this.summary = summary;
        this.detail = detail;
        this.changedAt = changedAt;
    }

    public UUID getId() { return id; }
    public UUID getChangedByAssociateId() { return changedByAssociateId; }
    public String getSection() { return section; }
    public String getSummary() { return summary; }
    public String getDetail() { return detail; }
    public Instant getChangedAt() { return changedAt; }
}
