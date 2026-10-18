package com.plotchain.expense;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "expense")
public class Expense {
    @Id private UUID id;
    @Column(name = "expense_date") private LocalDate expenseDate;
    @Column(name = "expense_type_id") private UUID expenseTypeId;
    @Column(name = "project_id") private UUID projectId;
    @Column(name = "pay_to") private String payTo;
    private BigDecimal amount;
    @Enumerated(EnumType.STRING) @Column(name = "pay_mode") private PayMode payMode;
    @Column(name = "bank_name") private String bankName;
    @Column(name = "txn_no") private String txnNo;
    private String remarks;
    @Column(name = "created_at") private Instant createdAt;

    protected Expense() {}

    public Expense(UUID id, LocalDate expenseDate, UUID expenseTypeId, UUID projectId, String payTo, BigDecimal amount,
                   PayMode payMode, String bankName, String txnNo, String remarks) {
        this.id = id;
        this.expenseDate = expenseDate;
        this.expenseTypeId = expenseTypeId;
        this.projectId = projectId;
        this.payTo = payTo;
        this.amount = amount;
        this.payMode = payMode;
        this.bankName = bankName;
        this.txnNo = txnNo;
        this.remarks = remarks;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public LocalDate getExpenseDate() { return expenseDate; }
    public UUID getExpenseTypeId() { return expenseTypeId; }
    public UUID getProjectId() { return projectId; }
    public String getPayTo() { return payTo; }
    public BigDecimal getAmount() { return amount; }
    public PayMode getPayMode() { return payMode; }
    public String getBankName() { return bankName; }
    public String getTxnNo() { return txnNo; }
    public String getRemarks() { return remarks; }
    public Instant getCreatedAt() { return createdAt; }
}
