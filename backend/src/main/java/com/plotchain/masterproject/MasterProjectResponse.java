package com.plotchain.masterproject;

import com.plotchain.projects.Project;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record MasterProjectResponse(
    UUID id, String name, MasterProject.Type type, String city, String state,
    BigDecimal businessPercentage, BigDecimal ratePerSqft, MasterProject.Status status,
    boolean hasLocationMap, boolean hasProjectMap, Instant createdAt,
    BigDecimal cornerExtraPercent, BigDecimal parkFacingExtraPercent, BigDecimal roadSideExtraPercent
) {
    // plotSide: the plot-side project (same id) holding the extra % defaults; null if missing.
    static MasterProjectResponse of(MasterProject p, Project plotSide) {
        return new MasterProjectResponse(p.getId(), p.getName(), p.getType(), p.getCity(),
            p.getState(), p.getBusinessPercentage(), p.getRatePerSqft(), p.getStatus(),
            p.getLocationMap() != null, p.getProjectMap() != null, p.getCreatedAt(),
            plotSide == null ? null : plotSide.getCornerExtraPercent(),
            plotSide == null ? null : plotSide.getParkFacingExtraPercent(),
            plotSide == null ? null : plotSide.getRoadSideExtraPercent());
    }
}
