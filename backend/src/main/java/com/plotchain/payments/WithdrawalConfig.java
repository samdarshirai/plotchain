package com.plotchain.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "withdrawal_config")
public class WithdrawalConfig {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    @Column(name = "approval_mode", nullable = false)
    private String approvalMode;

    @Column(name = "auto_approve_limit")
    private BigDecimal autoApproveLimit;

    @Column(name = "minimum_withdrawal_amount")
    private BigDecimal minimumWithdrawalAmount;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public String getApprovalMode() { return approvalMode; }
    public void setApprovalMode(String approvalMode) { this.approvalMode = approvalMode; }

    public BigDecimal getAutoApproveLimit() { return autoApproveLimit; }
    public void setAutoApproveLimit(BigDecimal autoApproveLimit) { this.autoApproveLimit = autoApproveLimit; }

    public BigDecimal getMinimumWithdrawalAmount() { return minimumWithdrawalAmount; }
    public void setMinimumWithdrawalAmount(BigDecimal minimumWithdrawalAmount) { this.minimumWithdrawalAmount = minimumWithdrawalAmount; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
