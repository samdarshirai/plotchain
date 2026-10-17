package com.plotchain.projects;

import java.math.BigDecimal;
import java.util.UUID;

// Availability-grid row for any authenticated user (plot-booking unit 10, Decision 10).
// Deliberately NOT PlotResponse: no rate, no thumbnail, and nothing about bookings/buyers/associates.
public record PlotGridResponse(
    UUID plotId,
    String plotNo,
    PlotType type,
    BigDecimal area,   // square feet (plot.area_sqft)
    BigDecimal price,
    PlotStatus status,
    BigDecimal extraPrice,
    BigDecimal roadSizeFt
) {
    public PlotGridResponse(UUID plotId, String plotNo, PlotType type, BigDecimal area, BigDecimal price, PlotStatus status, BigDecimal extraPrice) {
        this(plotId, plotNo, type, area, price, status, extraPrice, null);
    }

    public PlotGridResponse(UUID plotId, String plotNo, PlotType type, BigDecimal area, BigDecimal price, PlotStatus status) {
        this(plotId, plotNo, type, area, price, status, BigDecimal.ZERO, null);
    }
}
