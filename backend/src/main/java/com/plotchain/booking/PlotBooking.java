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

    // The buyer's sponsor: earns Direct Income and receives the binary volume. associateId is the buyer.
    @Column(name = "sponsor_id", nullable = false)
    private UUID sponsorId;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "list_price")
    private BigDecimal listPrice;

    @Column(nullable = false)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(name = "extra_price", nullable = false)
    private BigDecimal extraPrice = BigDecimal.ZERO;

    @Column(name = "area_sqft")
    private BigDecimal areaSqft;

    private BigDecimal rate;

    @Column(name = "installment_count", nullable = false)
    private int installmentCount;

    @Column(name = "booked_at", nullable = false)
    private Instant bookedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingStatus status = BookingStatus.ACTIVE;

    @Column(name = "buyer_associate_id", nullable = false)
    private UUID buyerAssociateId;

    @Column(name = "buyer_phone")
    private String buyerPhone;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "cancellation_charge_pct")
    private BigDecimal cancellationChargePct;

    @Column(name = "cancellation_charge")
    private BigDecimal cancellationCharge;

    @Column(name = "refund_amount")
    private BigDecimal refundAmount;

    public BigDecimal getCancellationChargePct() { return cancellationChargePct; }
    public BigDecimal getCancellationCharge() { return cancellationCharge; }
    public BigDecimal getRefundAmount() { return refundAmount; }
    public void setCancellationCharge(BigDecimal pct, BigDecimal charge, BigDecimal refund) {
        this.cancellationChargePct = pct;
        this.cancellationCharge = charge;
        this.refundAmount = refund;
    }

    public BookingStatus getStatus() { return status; }
    public void setStatus(BookingStatus status) { this.status = status; }
    public UUID getBuyerAssociateId() { return buyerAssociateId; }
    public void setBuyerAssociateId(UUID buyerAssociateId) { this.buyerAssociateId = buyerAssociateId; }
    public String getBuyerPhone() { return buyerPhone; }
    public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(Instant confirmedAt) { this.confirmedAt = confirmedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPlotId() { return plotId; }
    public void setPlotId(UUID plotId) { this.plotId = plotId; }
    public UUID getSponsorId() { return sponsorId; }
    public void setSponsorId(UUID sponsorId) { this.sponsorId = sponsorId; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public BigDecimal getListPrice() { return listPrice; }
    public void setListPrice(BigDecimal listPrice) { this.listPrice = listPrice; }
    public BigDecimal getExtraPrice() { return extraPrice; }
    public void setExtraPrice(BigDecimal extraPrice) { this.extraPrice = extraPrice; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public BigDecimal getAreaSqft() { return areaSqft; }
    public void setAreaSqft(BigDecimal areaSqft) { this.areaSqft = areaSqft; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public int getInstallmentCount() { return installmentCount; }
    public void setInstallmentCount(int installmentCount) { this.installmentCount = installmentCount; }
    public Instant getBookedAt() { return bookedAt; }
    public void setBookedAt(Instant bookedAt) { this.bookedAt = bookedAt; }
}
