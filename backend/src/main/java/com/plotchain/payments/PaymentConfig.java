package com.plotchain.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payment_config")
public class PaymentConfig {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    @Column(name = "gateway")
    private String gateway;

    @Column(name = "credentials_encrypted")
    private String credentialsEncrypted;

    @Column(name = "modes_enabled")
    private String modesEnabled;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public String getGateway() { return gateway; }
    public void setGateway(String gateway) { this.gateway = gateway; }

    public String getCredentialsEncrypted() { return credentialsEncrypted; }
    public void setCredentialsEncrypted(String credentialsEncrypted) { this.credentialsEncrypted = credentialsEncrypted; }

    public String getModesEnabled() { return modesEnabled; }
    public void setModesEnabled(String modesEnabled) { this.modesEnabled = modesEnabled; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
