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
    @Column(nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    public static Wallet zero(UUID associateId) {
        Wallet w = new Wallet();
        w.associateId = associateId;
        return w;
    }

    public UUID getAssociateId() { return associateId; }
    public BigDecimal getBalance() { return balance; }
}
