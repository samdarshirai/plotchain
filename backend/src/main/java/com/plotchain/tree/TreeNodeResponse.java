package com.plotchain.tree;

import com.plotchain.associate.KycStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record TreeNodeResponse(
    UUID id, String userId, String name, String rankName, KycStatus kycStatus, String position,
    BigDecimal leftLegVolume, BigDecimal rightLegVolume,
    boolean skewedLegsFlag, boolean stagnantFlag, List<TreeNodeResponse> children) {}
