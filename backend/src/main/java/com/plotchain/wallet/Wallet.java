package com.plotchain.wallet;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "wallet")
public class Wallet {
    @Id
    @Column(name = "associate_id")
    private UUID associateId;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    @Column(nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    public static Wallet zero(UUID associateId, UUID tenantId) {
        Wallet w = new Wallet();
        w.associateId = associateId;
        w.tenantId = tenantId;
        return w;
    }

    public UUID getAssociateId() { return associateId; }
    public UUID getTenantId() { return tenantId; }
    public BigDecimal getBalance() { return balance; }
}
