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
@Table(name = "loan_repayment")
public class LoanRepayment {

    @Id
    private UUID id;
    @Column(name = "loan_id")
    private UUID loanId;
    @Column(name = "receipt_no")
    private String receiptNo;
    @Column(name = "payment_date")
    private LocalDate paymentDate;
    private BigDecimal amount;
    @Enumerated(EnumType.STRING)
    @Column(name = "pay_mode")
    private PayMode payMode;
    @Column(name = "bank_name")
    private String bankName;
    @Column(name = "txn_no")
    private String txnNo;
    @Column(name = "created_at")
    private Instant createdAt;

    protected LoanRepayment() {}

    public LoanRepayment(UUID id, UUID loanId, String receiptNo, LocalDate paymentDate, BigDecimal amount,
                         PayMode payMode, String bankName, String txnNo) {
        this.id = id;
        this.loanId = loanId;
        this.receiptNo = receiptNo;
        this.paymentDate = paymentDate;
        this.amount = amount;
        this.payMode = payMode;
        this.bankName = bankName;
        this.txnNo = txnNo;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getLoanId() { return loanId; }
    public String getReceiptNo() { return receiptNo; }
    public LocalDate getPaymentDate() { return paymentDate; }
    public BigDecimal getAmount() { return amount; }
    public PayMode getPayMode() { return payMode; }
    public String getBankName() { return bankName; }
    public String getTxnNo() { return txnNo; }
}
