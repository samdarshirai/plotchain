package com.plotchain.epin;

import java.security.SecureRandom;
import java.util.Base64;

// epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Decision 2): copies com.plotchain.associate.TemporaryPasswordGenerator's exact pattern rather
// than reusing that class directly -- e-PIN codes are a different domain concept that happens to
// share an implementation shape, not a real cross-domain dependency. No "PIN-like" numeric
// format: redemption is always Admin-driven (see spec Context), so no human ever types this code
// by hand.
public final class EPinCodeGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    private EPinCodeGenerator() {
    }

    public static String generate() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
