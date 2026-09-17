package com.plotchain.epin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

// epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Data model section): only the generation-time columns are mapped here. redeemed_to/
// redeemed_by/redeemed_at/redemption_type/linked_entity_id already exist on the epin table
// (migration V33) so a later redeem unit needs no schema change, but they stay unmapped in this
// entity until that unit's service logic actually reads/writes them -- Hibernate's
// ddl-auto=validate only checks mapped columns, so an unmapped extra DB column is not an error.
@Entity
@Table(name = "epin")
public class EPin {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String code;

    @Column(name = "batch_id", nullable = false)
    private UUID batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EPinStatus status;

    @Column(name = "generated_by", nullable = false)
    private UUID generatedBy;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public UUID getBatchId() { return batchId; }
    public void setBatchId(UUID batchId) { this.batchId = batchId; }
    public EPinStatus getStatus() { return status; }
    public void setStatus(EPinStatus status) { this.status = status; }
    public UUID getGeneratedBy() { return generatedBy; }
    public void setGeneratedBy(UUID generatedBy) { this.generatedBy = generatedBy; }
    public Instant getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }
}
