package com.plotchain.projects;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ProjectResponse(
    UUID id,
    String name,
    String location,
    boolean hasThumbnail,
    long totalPlots,
    long availablePlots,
    long soldPlots,
    Instant createdAt,
    UUID masterProjectId,
    BigDecimal cornerExtraPercent,
    BigDecimal parkFacingExtraPercent,
    BigDecimal roadSideExtraPercent
) {}
