package com.plotchain.compensation;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "royalty_bonus_rate")
public class RoyaltyBonusRate {
    @Id
    private UUID id;
    @Column(name = "plan_version_id")
    private UUID planVersionId;
    @Column(name = "rank_id")
    private UUID rankId;
    @Column(name = "royalty_pct")
    private BigDecimal royaltyPct;

    protected RoyaltyBonusRate() {}

    public RoyaltyBonusRate(UUID id, UUID planVersionId, UUID rankId, BigDecimal royaltyPct) {
        this.id = id;
        this.planVersionId = planVersionId;
        this.rankId = rankId;
        this.royaltyPct = royaltyPct;
    }

    public UUID getId() { return id; }
    public UUID getPlanVersionId() { return planVersionId; }
    public UUID getRankId() { return rankId; }
    public BigDecimal getRoyaltyPct() { return royaltyPct; }
}
