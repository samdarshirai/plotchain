package com.plotchain.compensation;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Compensation plan versions are append-only: never mutate a version in place, always insert a
// new row. Immutability here (no setters) makes that invariant compiler-enforced. The one
// sanctioned exception lives in CompensationPlanService#updatePlan: a version whose
// effective_from is today and whose author is the admin saving right now is deleted and
// re-inserted wholesale (never mutated), so that a day's autosaves collapse into one version.
@Entity
@Table(name = "compensation_plan_version")
public class CompensationPlanVersion {
    @Id
    private UUID id;
    @Column(name = "version_label")
    private String versionLabel;
    @Column(name = "effective_from")
    private LocalDate effectiveFrom;
    @Column(name = "direct_income_pct")
    private BigDecimal directIncomePct;
    @Column(name = "matching_income_pct")
    private BigDecimal matchingIncomePct;
    @Column(name = "sponsor_matching_pct")
    private BigDecimal sponsorMatchingPct;
    @Column(name = "tds_pct")
    private BigDecimal tdsPct;
    @Column(name = "admin_charge_with_pan_pct")
    private BigDecimal adminChargeWithPanPct;
    @Column(name = "admin_charge_without_pan_pct")
    private BigDecimal adminChargeWithoutPanPct;
    @Column(name = "activation_fee")
    private BigDecimal activationFee;
    @Column(name = "min_withdrawal")
    private BigDecimal minWithdrawal;
    @Enumerated(EnumType.STRING)
    @Column(name = "settlement_cycle")
    private SettlementCycle settlementCycle;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "created_by_associate_id")
    private UUID createdByAssociateId;

    protected CompensationPlanVersion() {}

    public CompensationPlanVersion(
            UUID id,
            String versionLabel,
            LocalDate effectiveFrom,
            BigDecimal directIncomePct,
            BigDecimal matchingIncomePct,
            BigDecimal sponsorMatchingPct,
            BigDecimal tdsPct,
            BigDecimal adminChargeWithPanPct,
            BigDecimal adminChargeWithoutPanPct,
            BigDecimal activationFee,
            BigDecimal minWithdrawal,
            SettlementCycle settlementCycle,
            Instant createdAt,
            UUID createdByAssociateId) {
        this.id = id;
        this.versionLabel = versionLabel;
        this.effectiveFrom = effectiveFrom;
        this.directIncomePct = directIncomePct;
        this.matchingIncomePct = matchingIncomePct;
        this.sponsorMatchingPct = sponsorMatchingPct;
        this.tdsPct = tdsPct;
        this.adminChargeWithPanPct = adminChargeWithPanPct;
        this.adminChargeWithoutPanPct = adminChargeWithoutPanPct;
        this.activationFee = activationFee;
        this.minWithdrawal = minWithdrawal;
        this.settlementCycle = settlementCycle;
        this.createdAt = createdAt;
        this.createdByAssociateId = createdByAssociateId;
    }

    public UUID getId() { return id; }
    public String getVersionLabel() { return versionLabel; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public BigDecimal getDirectIncomePct() { return directIncomePct; }
    public BigDecimal getMatchingIncomePct() { return matchingIncomePct; }
    public BigDecimal getSponsorMatchingPct() { return sponsorMatchingPct; }
    public BigDecimal getTdsPct() { return tdsPct; }
    public BigDecimal getAdminChargeWithPanPct() { return adminChargeWithPanPct; }
    public BigDecimal getAdminChargeWithoutPanPct() { return adminChargeWithoutPanPct; }
    public BigDecimal getActivationFee() { return activationFee; }
    public BigDecimal getMinWithdrawal() { return minWithdrawal; }
    public SettlementCycle getSettlementCycle() { return settlementCycle; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getCreatedByAssociateId() { return createdByAssociateId; }
}
