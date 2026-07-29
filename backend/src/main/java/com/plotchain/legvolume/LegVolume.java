package com.plotchain.legvolume;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "leg_volume")
public class LegVolume {
    @Id
    private UUID id;
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
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

    public static LegVolume empty(UUID associateId, UUID cycleId, UUID tenantId) {
        LegVolume lv = new LegVolume();
        lv.id = UUID.randomUUID();
        lv.tenantId = tenantId;
        lv.associateId = associateId;
        lv.cycleId = cycleId;
        return lv;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getAssociateId() { return associateId; }
    public UUID getCycleId() { return cycleId; }
    public BigDecimal getLeftLegVolume() { return leftLegVolume; }
    public BigDecimal getRightLegVolume() { return rightLegVolume; }
    public BigDecimal getCarriedForwardLeft() { return carriedForwardLeft; }
    public BigDecimal getCarriedForwardRight() { return carriedForwardRight; }
}
