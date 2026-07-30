package com.plotchain.projects;

import java.math.BigDecimal;
import java.util.UUID;

public record PlotResponse(
    UUID id,
    String plotNo,
    String plotType,
    BigDecimal areaSqft,
    BigDecimal rate,
    BigDecimal price,
    String status
) {}
