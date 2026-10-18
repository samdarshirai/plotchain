package com.plotchain.advanceloan;

import com.plotchain.expense.PayMode;
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
@Table(name = "advance_loan")
public class AdvanceLoan {

    @Id
    private UUID id;
    @Column(name = "associate_id")
    private UUID associateId;
    @Column(name = "loan_date")
    private LocalDate loanDate;
    private BigDecimal amount;
    @Column(name = "previous_dues")
    private BigDecimal previousDues;
    @Enumerated(EnumType.STRING)
    @Column(name = "pay_mode")
    private PayMode payMode;
    @Column(name = "bank_name")
    private String bankName;
    @Column(name = "instrument_no")
    private String instrumentNo;
    private String remarks;
    @Column(name = "created_at")
    private Instant createdAt;

    protected AdvanceLoan() {}

    public AdvanceLoan(UUID id, UUID associateId, LocalDate loanDate, BigDecimal amount, BigDecimal previousDues,
                       PayMode payMode, String bankName, String instrumentNo, String remarks) {
        this.id = id;
        this.associateId = associateId;
        this.loanDate = loanDate;
        this.amount = amount;
        this.previousDues = previousDues;
        this.payMode = payMode;
        this.bankName = bankName;
        this.instrumentNo = instrumentNo;
        this.remarks = remarks;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getAssociateId() { return associateId; }
    public LocalDate getLoanDate() { return loanDate; }
    public BigDecimal getAmount() { return amount; }
    public BigDecimal getPreviousDues() { return previousDues; }
    public PayMode getPayMode() { return payMode; }
    public String getBankName() { return bankName; }
    public String getInstrumentNo() { return instrumentNo; }
    public String getRemarks() { return remarks; }
}
