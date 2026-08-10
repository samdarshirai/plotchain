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

    // Cycle-management unit 4 adds these two setters as forward-compatibility for unit 5
    // (Matching Income, Decision #5): unit 5 mutates carriedForwardLeft/carriedForwardRight on
    // the SAME LegVolume row a cycle's rollup just wrote, to carry the unmatched excess into
    // next cycle's rollup. Unit 4's own logic never calls these -- it only ever constructs rows
    // with both fields at BigDecimal.ZERO via the constructor above.
    public void setCarriedForwardLeft(BigDecimal carriedForwardLeft) { this.carriedForwardLeft = carriedForwardLeft; }
    public void setCarriedForwardRight(BigDecimal carriedForwardRight) { this.carriedForwardRight = carriedForwardRight; }
}
