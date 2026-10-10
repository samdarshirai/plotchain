package com.plotchain.epin;

import java.security.SecureRandom;

// E-PINs are 6-digit zero-padded random numbers. Only 1,000,000 values exist, so
// EPinService's existsByCode retry loop spins if the pool is ever exhausted.
public final class EPinCodeGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private EPinCodeGenerator() {
    }

    public static String generate() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }
}
