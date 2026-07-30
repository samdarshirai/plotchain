package com.plotchain.company;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "setup_state")
public class SetupState {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    @Column(name = "terms_accepted_at")
    private Instant termsAcceptedAt;

    @Column(name = "launched_at")
    private Instant launchedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public Instant getTermsAcceptedAt() { return termsAcceptedAt; }
    public void setTermsAcceptedAt(Instant termsAcceptedAt) { this.termsAcceptedAt = termsAcceptedAt; }

    public Instant getLaunchedAt() { return launchedAt; }
    public void setLaunchedAt(Instant launchedAt) { this.launchedAt = launchedAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
