package com.plotchain.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "kyc_config")
public class KycConfig {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    @Column(name = "strictness", nullable = false)
    private String strictness;

    @Column(name = "required_documents", nullable = false)
    private String requiredDocuments;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public String getStrictness() { return strictness; }
    public void setStrictness(String strictness) { this.strictness = strictness; }

    public String getRequiredDocuments() { return requiredDocuments; }
    public void setRequiredDocuments(String requiredDocuments) { this.requiredDocuments = requiredDocuments; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
