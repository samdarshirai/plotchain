package com.plotchain.associate;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record AssociateSummaryResponse(UUID id, String userId, String name, AssociateRole role, AssociateStatus status, boolean hasFreeSlot, boolean hasEpin, List<String> freeLegs,
                                       UUID sponsorId, String sponsorUserId, String sponsorName, String phone) {

    static AssociateSummaryResponse from(Associate associate, Set<String> occupied, boolean hasEpin, Associate sponsor) {
        List<String> freeLegs = List.of("L", "R").stream().filter(l -> !occupied.contains(l)).toList();
        return new AssociateSummaryResponse(associate.getId(), associate.getUserId(), associate.getName(), associate.getRole(), associate.getStatus(), !freeLegs.isEmpty(), hasEpin, freeLegs,
            sponsor == null ? null : sponsor.getId(), sponsor == null ? null : sponsor.getUserId(), sponsor == null ? null : sponsor.getName(), associate.getPhone());
    }
}
