package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTest {

    private static final String SECRET = "test-secret-key-at-least-32-bytes-long-for-hs256";

    @Test
    void generatesATokenThatRoundTripsAssociateIdAndRole() {
        JwtService jwtService = new JwtService(SECRET, 60);
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ADMIN);

        String token = jwtService.generateToken(associate);

        assertThat(jwtService.isTokenValid(token)).isTrue();
        assertThat(jwtService.extractAssociateId(token)).isEqualTo(associate.getId());
        assertThat(jwtService.extractRole(token)).isEqualTo(AssociateRole.ADMIN);
    }

    @Test
    void rejectsATokenSignedWithADifferentSecret() {
        JwtService signer = new JwtService(SECRET, 60);
        JwtService verifier = new JwtService("different-secret-key-at-least-32-bytes-long!!", 60);
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);

        String token = signer.generateToken(associate);

        assertThat(verifier.isTokenValid(token)).isFalse();
    }

    @Test
    void rejectsAnExpiredToken() throws InterruptedException {
        JwtService jwtService = new JwtService(SECRET, 0);
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);

        String token = jwtService.generateToken(associate);
        Thread.sleep(1000);

        assertThat(jwtService.isTokenValid(token)).isFalse();
    }
}
