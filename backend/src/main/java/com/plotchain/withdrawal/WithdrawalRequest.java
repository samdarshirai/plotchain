package com.plotchain.withdrawal;

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
@Table(name = "withdrawal_request")
public class WithdrawalRequest {

    @Id
    private UUID id;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WithdrawalRequestStatus status;

    private String reason;

    @Column(name = "bank_reference")
    private String bankReference;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "disbursed_at")
    private Instant disbursedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public WithdrawalRequestStatus getStatus() { return status; }
    public void setStatus(WithdrawalRequestStatus status) { this.status = status; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getBankReference() { return bankReference; }
    public void setBankReference(String bankReference) { this.bankReference = bankReference; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
    public Instant getDisbursedAt() { return disbursedAt; }
    public void setDisbursedAt(Instant disbursedAt) { this.disbursedAt = disbursedAt; }
}
