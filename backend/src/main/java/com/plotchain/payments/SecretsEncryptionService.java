package com.plotchain.payments;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.security.crypto.encrypt.Encryptors;
import org.springframework.security.crypto.encrypt.TextEncryptor;
import org.springframework.stereotype.Component;

@Component
public class SecretsEncryptionService {

    /** Public dev default from application.yml; startup must fail if it is active outside dev/test. */
    static final String DEV_DEFAULT_SECRETS_KEY = "dev-only-change-me-this-encryption-key-needs-32-bytes-too";

    // Encryptors.text() requires a hex-encoded salt. It is not a secret component of this
    // scheme -- the actual security boundary is PLOTCHAIN_SECRETS_KEY -- so a fixed constant is
    // fine: this app encrypts one shared credential blob, not many per-user passwords that would
    // need per-record salt rotation.
    private static final String SALT = "d9b4b2c8";

    private final TextEncryptor textEncryptor;

    @Autowired
    public SecretsEncryptionService(
        @Value("${plotchain.secrets-key}") String secretsKey,
        Environment environment
    ) {
        requireKeyIsSafeToUse(secretsKey, environment);
        this.textEncryptor = Encryptors.text(secretsKey, SALT);
    }

    /**
     * Convenience constructor for tests that build this service directly, without a Spring
     * ApplicationContext to supply an Environment. Safe because every such call site passes a
     * non-default key, so the dev-key guard never has a reason to trigger here -- an
     * Environment with no active profiles is treated as "not dev", i.e. fail-closed, same as
     * production.
     */
    public SecretsEncryptionService(String secretsKey) {
        this(secretsKey, new StandardEnvironment());
    }

    private static void requireKeyIsSafeToUse(String secretsKey, Environment environment) {
        boolean isDevOrTest = environment.acceptsProfiles(Profiles.of("dev", "test"));
        if (DEV_DEFAULT_SECRETS_KEY.equals(secretsKey) && !isDevOrTest) {
            throw new IllegalStateException(
                "plotchain.secrets-key is still set to the well-known development default. Set the "
                    + "PLOTCHAIN_SECRETS_KEY environment variable to a strong, unique key before "
                    + "starting this application outside the 'dev' or 'test' profile.");
        }
    }

    public String encrypt(String plaintext) {
        return textEncryptor.encrypt(plaintext);
    }

    public String decrypt(String ciphertext) {
        return textEncryptor.decrypt(ciphertext);
    }
}
