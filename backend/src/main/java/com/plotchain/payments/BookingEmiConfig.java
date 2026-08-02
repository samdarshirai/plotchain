package com.plotchain.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "booking_emi_config")
public class BookingEmiConfig {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    @Column(name = "emi_enabled", nullable = false)
    private boolean emiEnabled;

    @Column(name = "default_installment_count", nullable = false)
    private int defaultInstallmentCount;

    @Column(name = "confirm_rule", nullable = false)
    private String confirmRule;

    @Column(name = "confirm_threshold_percent")
    private Integer confirmThresholdPercent;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public boolean isEmiEnabled() { return emiEnabled; }
    public void setEmiEnabled(boolean emiEnabled) { this.emiEnabled = emiEnabled; }

    public int getDefaultInstallmentCount() { return defaultInstallmentCount; }
    public void setDefaultInstallmentCount(int defaultInstallmentCount) { this.defaultInstallmentCount = defaultInstallmentCount; }

    public String getConfirmRule() { return confirmRule; }
    public void setConfirmRule(String confirmRule) { this.confirmRule = confirmRule; }

    public Integer getConfirmThresholdPercent() { return confirmThresholdPercent; }
    public void setConfirmThresholdPercent(Integer confirmThresholdPercent) { this.confirmThresholdPercent = confirmThresholdPercent; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
