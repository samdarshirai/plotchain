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

    public String encrypt(String plaintext) {
        return textEncryptor.encrypt(plaintext);
    }

    public String decrypt(String ciphertext) {
        return textEncryptor.decrypt(ciphertext);
    }
}
