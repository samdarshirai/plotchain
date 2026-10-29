package com.plotchain.masterproject;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record MasterProjectResponse(
    UUID id, String name, MasterProject.Type type, String city, String state,
    BigDecimal businessPercentage, BigDecimal ratePerSqft, MasterProject.Status status,
    boolean hasLocationMap, boolean hasProjectMap, Instant createdAt, BigDecimal cornerExtraPercent
) {
    static MasterProjectResponse of(MasterProject p, BigDecimal cornerExtraPercent) {
        return new MasterProjectResponse(p.getId(), p.getName(), p.getType(), p.getCity(),
            p.getState(), p.getBusinessPercentage(), p.getRatePerSqft(), p.getStatus(),
            p.getLocationMap() != null, p.getProjectMap() != null, p.getCreatedAt(), cornerExtraPercent);
    }
}
