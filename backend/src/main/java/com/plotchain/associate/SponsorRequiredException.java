package com.plotchain.associate;

public class SponsorRequiredException extends RuntimeException {
    public SponsorRequiredException() {
        super("A sponsor is required: the root user already exists");
    }
}
