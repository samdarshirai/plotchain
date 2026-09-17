package com.plotchain.epin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

// epin-domain unit 1 mapped only the generation-time columns (id/code/batchId/status/
// generatedBy/generatedAt). Unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Data model section) adds the five redemption-time columns that migration V33 already created
// as nullable: redeemedTo is needed for the admin register's redeemedTo filter, and the other
// four (redeemedBy/redeemedAt/redemptionType/linkedEntityId) are mapped alongside it so the
// register's row shape (EPinResponse, this unit) is already correct once unit 4's redeem happy
// path starts populating them -- unit 4's own acceptance criteria assume these entity setters
// already exist and it has no chartered scope to add entity mapping itself. No redeem write
// logic lands here (units 3/4); this unit only reads/returns whatever is in these columns
// (currently always null, since every row today is UNUSED).
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

    @Column(name = "redeemed_to")
    private UUID redeemedTo;

    @Column(name = "redeemed_by")
    private UUID redeemedBy;

    @Column(name = "redeemed_at")
    private Instant redeemedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "redemption_type")
    private RedemptionType redemptionType;

    @Column(name = "linked_entity_id")
    private UUID linkedEntityId;

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
    public UUID getRedeemedTo() { return redeemedTo; }
    public void setRedeemedTo(UUID redeemedTo) { this.redeemedTo = redeemedTo; }
    public UUID getRedeemedBy() { return redeemedBy; }
    public void setRedeemedBy(UUID redeemedBy) { this.redeemedBy = redeemedBy; }
    public Instant getRedeemedAt() { return redeemedAt; }
    public void setRedeemedAt(Instant redeemedAt) { this.redeemedAt = redeemedAt; }
    public RedemptionType getRedemptionType() { return redemptionType; }
    public void setRedemptionType(RedemptionType redemptionType) { this.redemptionType = redemptionType; }
    public UUID getLinkedEntityId() { return linkedEntityId; }
    public void setLinkedEntityId(UUID linkedEntityId) { this.linkedEntityId = linkedEntityId; }
}
