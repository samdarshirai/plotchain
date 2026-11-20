package com.plotchain.associate;

public class PlacementRequiredException extends RuntimeException {
    public PlacementRequiredException() {
        super("A placement is required: the root user already exists");
    }
}
