package com.plotchain.expensetype;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "expense_type")
public class ExpenseType {

    public enum Status { ACTIVE, INACTIVE }

    @Id
    private UUID id;
    private String name;
    @Enumerated(EnumType.STRING)
    private Status status;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;

    protected ExpenseType() {}

    public ExpenseType(UUID id) {
        this.id = id;
        this.status = Status.ACTIVE;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void touch() { this.updatedAt = Instant.now(); }
}
