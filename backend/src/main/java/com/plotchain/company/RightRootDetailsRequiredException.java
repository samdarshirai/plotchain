package com.plotchain.company;

public class RightRootDetailsRequiredException extends RuntimeException {
    public RightRootDetailsRequiredException() {
        super("Right root name and phone are required when seeding a right root.");
    }
}
