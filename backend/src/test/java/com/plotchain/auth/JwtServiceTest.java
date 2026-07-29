package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET = "test-secret-key-at-least-32-bytes-long-for-hs256";
    private static final String DEV_DEFAULT_SECRET =
        "dev-only-change-me-this-needs-to-be-at-least-32-bytes-long";

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

    @Test
    void refusesToStartWithTheDevDefaultSecretWhenNoProfileIsActive() {
        MockEnvironment environment = new MockEnvironment(); // no active profiles

        assertThatThrownBy(() -> new JwtService(DEV_DEFAULT_SECRET, 60, environment))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesToStartWithTheDevDefaultSecretUnderAnUnrelatedProfile() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("staging");

        assertThatThrownBy(() -> new JwtService(DEV_DEFAULT_SECRET, 60, environment))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void allowsTheDevDefaultSecretUnderTheDevProfile() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThatCode(() -> new JwtService(DEV_DEFAULT_SECRET, 60, environment))
            .doesNotThrowAnyException();
    }

    @Test
    void allowsTheDevDefaultSecretUnderTheTestProfile() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("test");

        assertThatCode(() -> new JwtService(DEV_DEFAULT_SECRET, 60, environment))
            .doesNotThrowAnyException();
    }

    @Test
    void allowsANonDefaultSecretWithNoActiveProfile() {
        MockEnvironment environment = new MockEnvironment(); // no active profiles

        assertThatCode(() -> new JwtService(SECRET, 60, environment))
            .doesNotThrowAnyException();
    }
}
