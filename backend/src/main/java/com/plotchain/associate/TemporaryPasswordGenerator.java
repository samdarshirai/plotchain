package com.plotchain.associate;

import java.security.SecureRandom;
import java.util.Base64;

public final class TemporaryPasswordGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private TemporaryPasswordGenerator() {
    }

    public static String generate() {
        byte[] bytes = new byte[6]; // 6 bytes -> exactly 8 Base64-URL chars
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
