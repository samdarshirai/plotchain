package com.plotchain.compensation;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "reward_tier")
public class RewardTier {
    @Id
    private UUID id;
    @Column(name = "plan_version_id")
    private UUID planVersionId;
    @Column(name = "tier_level")
    private int tierLevel;
    @Column(name = "volume_threshold")
    private BigDecimal volumeThreshold;
    @Column(name = "cash_reward")
    private BigDecimal cashReward;
    @Column(name = "perk_description")
    private String perkDescription;

    protected RewardTier() {}

    public RewardTier(
            UUID id,
            UUID planVersionId,
            int tierLevel,
            BigDecimal volumeThreshold,
            BigDecimal cashReward,
            String perkDescription) {
        this.id = id;
        this.planVersionId = planVersionId;
        this.tierLevel = tierLevel;
        this.volumeThreshold = volumeThreshold;
        this.cashReward = cashReward;
        this.perkDescription = perkDescription;
    }

    public UUID getId() { return id; }
    public UUID getPlanVersionId() { return planVersionId; }
    public int getTierLevel() { return tierLevel; }
    public BigDecimal getVolumeThreshold() { return volumeThreshold; }
    public BigDecimal getCashReward() { return cashReward; }
    public String getPerkDescription() { return perkDescription; }
}
