package com.plotchain.legvolume;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "leg_volume")
public class LegVolume {
    @Id
    private UUID id;
    @Column(name = "associate_id", nullable = false)
    private UUID associateId;
    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;
    @Column(name = "left_leg_volume", nullable = false)
    private BigDecimal leftLegVolume = BigDecimal.ZERO;
    @Column(name = "right_leg_volume", nullable = false)
    private BigDecimal rightLegVolume = BigDecimal.ZERO;
    @Column(name = "carried_forward_left", nullable = false)
    private BigDecimal carriedForwardLeft = BigDecimal.ZERO;
    @Column(name = "carried_forward_right", nullable = false)
    private BigDecimal carriedForwardRight = BigDecimal.ZERO;

    protected LegVolume() {}

    public LegVolume(UUID id, UUID associateId, UUID cycleId, BigDecimal leftLegVolume, BigDecimal rightLegVolume,
                      BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight) {
        this.id = id;
        this.associateId = associateId;
        this.cycleId = cycleId;
        this.leftLegVolume = leftLegVolume;
        this.rightLegVolume = rightLegVolume;
        this.carriedForwardLeft = carriedForwardLeft;
        this.carriedForwardRight = carriedForwardRight;
    }

    public static LegVolume empty(UUID associateId, UUID cycleId) {
        LegVolume lv = new LegVolume();
        lv.id = UUID.randomUUID();
        lv.associateId = associateId;
        lv.cycleId = cycleId;
        return lv;
    }

    public UUID getId() { return id; }
    public UUID getAssociateId() { return associateId; }
    public UUID getCycleId() { return cycleId; }
    public BigDecimal getLeftLegVolume() { return leftLegVolume; }
    public BigDecimal getRightLegVolume() { return rightLegVolume; }
    public BigDecimal getCarriedForwardLeft() { return carriedForwardLeft; }
    public BigDecimal getCarriedForwardRight() { return carriedForwardRight; }
}
