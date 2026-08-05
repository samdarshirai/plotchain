package com.plotchain.sales;

import java.util.UUID;

public class PlotNotAvailableException extends RuntimeException {
    public PlotNotAvailableException(UUID plotId) {
        super("Plot is not available for sale: " + plotId);
    }
}
