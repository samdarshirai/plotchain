package com.plotchain.sales;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sale")
public class Sale {
    @Id
    private UUID id;
    @Column(name = "plot_id", nullable = false)
    private UUID plotId;
    @Column(name = "associate_id", nullable = false)
    private UUID associateId;
    @Column(name = "buyer_name", nullable = false)
    private String buyerName;
    @Column(name = "buyer_phone", nullable = false)
    private String buyerPhone;
    @Column(name = "buyer_email")
    private String buyerEmail;
    @Column(nullable = false)
    private BigDecimal amount;
    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;
    @Column(name = "leg_credited", nullable = false)
    private String legCredited;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SaleStatus status;
    @Column(name = "void_reason")
    private String voidReason;
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPlotId() { return plotId; }
    public void setPlotId(UUID plotId) { this.plotId = plotId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public String getBuyerName() { return buyerName; }
    public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
    public String getBuyerPhone() { return buyerPhone; }
    public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }
    public String getBuyerEmail() { return buyerEmail; }
    public void setBuyerEmail(String buyerEmail) { this.buyerEmail = buyerEmail; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }
    public String getLegCredited() { return legCredited; }
    public void setLegCredited(String legCredited) { this.legCredited = legCredited; }
    public SaleStatus getStatus() { return status; }
    public void setStatus(SaleStatus status) { this.status = status; }
    public String getVoidReason() { return voidReason; }
    public void setVoidReason(String voidReason) { this.voidReason = voidReason; }
    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }
}
