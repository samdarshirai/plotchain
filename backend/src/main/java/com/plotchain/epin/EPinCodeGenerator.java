package com.plotchain.epin;

import java.security.SecureRandom;

// E-PINs are 8 random characters drawn from A-Z and 0-9 (36^8 values), so
// EPinService's existsByCode retry loop practically never collides.
public final class EPinCodeGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int LENGTH = 8;

    private EPinCodeGenerator() {
    }

    public static String generate() {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }
}
