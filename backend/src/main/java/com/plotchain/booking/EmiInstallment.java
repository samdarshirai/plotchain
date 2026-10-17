package com.plotchain.booking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "emi_installment")
public class EmiInstallment {

    @Id
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Column(name = "installment_number", nullable = false)
    private int installmentNumber;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InstallmentStatus status = InstallmentStatus.PENDING;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "payment_ref")
    private String paymentRef;

    @Column(name = "recorded_by")
    private UUID recordedBy;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "confirmed_by")
    private UUID confirmedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_mode")
    private PaymentMode paymentMode;

    @Column(name = "bank_name")
    private String bankName;

    @Column(name = "recorded_at")
    private Instant recordedAt;

    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }

    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }

    public InstallmentStatus getStatus() { return status; }
    public void setStatus(InstallmentStatus status) { this.status = status; }
    public Instant getPaidAt() { return paidAt; }
    public void setPaidAt(Instant paidAt) { this.paidAt = paidAt; }
    public String getPaymentRef() { return paymentRef; }
    public void setPaymentRef(String paymentRef) { this.paymentRef = paymentRef; }
    public UUID getRecordedBy() { return recordedBy; }
    public void setRecordedBy(UUID recordedBy) { this.recordedBy = recordedBy; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(Instant confirmedAt) { this.confirmedAt = confirmedAt; }
    public UUID getConfirmedBy() { return confirmedBy; }
    public void setConfirmedBy(UUID confirmedBy) { this.confirmedBy = confirmedBy; }
    public PaymentMode getPaymentMode() { return paymentMode; }
    public void setPaymentMode(PaymentMode paymentMode) { this.paymentMode = paymentMode; }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getBookingId() { return bookingId; }
    public void setBookingId(UUID bookingId) { this.bookingId = bookingId; }
    public int getInstallmentNumber() { return installmentNumber; }
    public void setInstallmentNumber(int installmentNumber) { this.installmentNumber = installmentNumber; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
}
