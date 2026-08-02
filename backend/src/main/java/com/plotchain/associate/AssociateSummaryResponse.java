package com.plotchain.associate;

import java.util.UUID;

public record AssociateSummaryResponse(UUID id, String userId, String name) {

    static AssociateSummaryResponse from(Associate associate) {
        return new AssociateSummaryResponse(associate.getId(), associate.getUserId(), associate.getName());
    }
}
