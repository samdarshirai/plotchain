package com.plotchain.booking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "plot_booking")
public class PlotBooking {

    @Id
    private UUID id;

    @Column(name = "plot_id", nullable = false)
    private UUID plotId;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "installment_count", nullable = false)
    private int installmentCount;

    @Column(name = "booked_at", nullable = false)
    private Instant bookedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingStatus status = BookingStatus.ACTIVE;

    @Column(name = "buyer_name", nullable = false)
    private String buyerName;

    @Column(name = "buyer_phone")
    private String buyerPhone;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "sale_id")
    private UUID saleId;

    public BookingStatus getStatus() { return status; }
    public void setStatus(BookingStatus status) { this.status = status; }
    public String getBuyerName() { return buyerName; }
    public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
    public String getBuyerPhone() { return buyerPhone; }
    public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(Instant confirmedAt) { this.confirmedAt = confirmedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
    public UUID getSaleId() { return saleId; }
    public void setSaleId(UUID saleId) { this.saleId = saleId; }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPlotId() { return plotId; }
    public void setPlotId(UUID plotId) { this.plotId = plotId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public int getInstallmentCount() { return installmentCount; }
    public void setInstallmentCount(int installmentCount) { this.installmentCount = installmentCount; }
    public Instant getBookedAt() { return bookedAt; }
    public void setBookedAt(Instant bookedAt) { this.bookedAt = bookedAt; }
}
