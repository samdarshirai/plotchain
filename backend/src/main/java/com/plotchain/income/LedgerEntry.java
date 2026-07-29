package com.plotchain.income;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ledger_entry")
public class LedgerEntry {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    @Column(name = "associate_id", nullable = false)
    private UUID associateId;
    @Enumerated(EnumType.STRING)
    @Column(name = "income_type", nullable = false)
    private IncomeType incomeType;
    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;
    @Column(name = "gross_amount", nullable = false)
    private BigDecimal grossAmount;
    @Column(name = "tds_deduction", nullable = false)
    private BigDecimal tdsDeduction;
    @Column(name = "admin_deduction", nullable = false)
    private BigDecimal adminDeduction;
    @Column(name = "net_amount", nullable = false)
    private BigDecimal netAmount;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LedgerEntryStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public IncomeType getIncomeType() { return incomeType; }
    public void setIncomeType(IncomeType incomeType) { this.incomeType = incomeType; }
    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }
    public BigDecimal getGrossAmount() { return grossAmount; }
    public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }
    public BigDecimal getTdsDeduction() { return tdsDeduction; }
    public void setTdsDeduction(BigDecimal tdsDeduction) { this.tdsDeduction = tdsDeduction; }
    public BigDecimal getAdminDeduction() { return adminDeduction; }
    public void setAdminDeduction(BigDecimal adminDeduction) { this.adminDeduction = adminDeduction; }
    public BigDecimal getNetAmount() { return netAmount; }
    public void setNetAmount(BigDecimal netAmount) { this.netAmount = netAmount; }
    public LedgerEntryStatus getStatus() { return status; }
    public void setStatus(LedgerEntryStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
