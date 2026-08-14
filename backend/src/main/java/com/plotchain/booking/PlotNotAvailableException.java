package com.plotchain.booking;

import java.util.UUID;

// A booking-scoped copy of the same idea as sales.PlotNotAvailableException, not a reuse of
// that class -- booking must not import the sales package (packages stay siblings, not
// cross-dependent), and the message is domain-specific ("for booking", not "for sale").
public class PlotNotAvailableException extends RuntimeException {
    public PlotNotAvailableException(UUID plotId) {
        super("Plot is not available for booking: " + plotId);
    }
}
