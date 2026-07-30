package com.plotchain.projects;

import java.util.UUID;

public class PlotNotFoundException extends RuntimeException {
    public PlotNotFoundException(UUID plotId) {
        super("Plot not found: " + plotId);
    }
}
