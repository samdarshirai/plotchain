package com.plotchain.associate;

import java.util.UUID;

public record AssociateSummaryResponse(UUID id, String userId, String name, AssociateRole role, AssociateStatus status, boolean hasFreeSlot, boolean hasEpin) {

    static AssociateSummaryResponse from(Associate associate, boolean hasFreeSlot, boolean hasEpin) {
        return new AssociateSummaryResponse(associate.getId(), associate.getUserId(), associate.getName(), associate.getRole(), associate.getStatus(), hasFreeSlot, hasEpin);
    }
}
