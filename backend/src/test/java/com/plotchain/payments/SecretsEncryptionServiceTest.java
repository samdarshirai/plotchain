package com.plotchain.payments;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecretsEncryptionServiceTest {

    private static final String KEY = "test-secrets-key-at-least-32-bytes-long-for-aes";
    private static final String DEV_DEFAULT_SECRETS_KEY =
        "dev-only-change-me-this-encryption-key-needs-32-bytes-too";

    @Test
    void roundTripsAValueThroughEncryptAndDecrypt() {
        SecretsEncryptionService service = new SecretsEncryptionService(KEY);

        String ciphertext = service.encrypt("razorpay-secret-value");

        assertThat(ciphertext).isNotEqualTo("razorpay-secret-value");
        assertThat(service.decrypt(ciphertext)).isEqualTo("razorpay-secret-value");
    }

    @Test
    void refusesToStartWithTheDevDefaultKeyWhenNoProfileIsActive() {
        MockEnvironment environment = new MockEnvironment(); // no active profiles

        assertThatThrownBy(() -> new SecretsEncryptionService(DEV_DEFAULT_SECRETS_KEY, environment))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesToStartWithTheDevDefaultKeyUnderAnUnrelatedProfile() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("staging");

        assertThatThrownBy(() -> new SecretsEncryptionService(DEV_DEFAULT_SECRETS_KEY, environment))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void allowsTheDevDefaultKeyUnderTheDevProfile() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThatCode(() -> new SecretsEncryptionService(DEV_DEFAULT_SECRETS_KEY, environment))
            .doesNotThrowAnyException();
    }

    @Test
    void allowsTheDevDefaultKeyUnderTheTestProfile() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("test");

        assertThatCode(() -> new SecretsEncryptionService(DEV_DEFAULT_SECRETS_KEY, environment))
            .doesNotThrowAnyException();
    }

    @Test
    void allowsANonDefaultKeyWithNoActiveProfile() {
        MockEnvironment environment = new MockEnvironment(); // no active profiles

        assertThatCode(() -> new SecretsEncryptionService(KEY, environment))
            .doesNotThrowAnyException();
    }
}
