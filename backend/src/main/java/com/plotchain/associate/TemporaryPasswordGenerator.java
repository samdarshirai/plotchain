package com.plotchain.associate;

import java.security.SecureRandom;

public final class TemporaryPasswordGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private TemporaryPasswordGenerator() {
    }

    public static String generate() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }
}
