package com.plotchain.associate;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record AssociateSummaryResponse(UUID id, String userId, String name, AssociateRole role, AssociateStatus status, boolean hasFreeSlot, boolean hasEpin, List<String> freeLegs) {

    static AssociateSummaryResponse from(Associate associate, Set<String> occupied, boolean hasEpin) {
        List<String> freeLegs = List.of("L", "R").stream().filter(l -> !occupied.contains(l)).toList();
        return new AssociateSummaryResponse(associate.getId(), associate.getUserId(), associate.getName(), associate.getRole(), associate.getStatus(), !freeLegs.isEmpty(), hasEpin, freeLegs);
    }
}
