package com.plotchain.rank;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "rank_tier")
public class RankTier {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
    private String name;
    @Column(name = "rank_order")
    private int rankOrder;
    @Column(name = "volume_threshold")
    private BigDecimal volumeThreshold;

    protected RankTier() {}

    public RankTier(UUID id, UUID tenantId, String name, int rankOrder, BigDecimal volumeThreshold) {
        this.id = id;
        this.tenantId = tenantId;
        this.name = name;
        this.rankOrder = rankOrder;
        this.volumeThreshold = volumeThreshold;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getName() { return name; }
    public int getRankOrder() { return rankOrder; }
    public BigDecimal getVolumeThreshold() { return volumeThreshold; }
}
