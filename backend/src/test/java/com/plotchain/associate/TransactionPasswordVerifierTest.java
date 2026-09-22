package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TransactionPasswordVerifierTest {

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    TransactionPasswordVerifier verifier;

    @BeforeEach
    void setUp() {
        verifier = new TransactionPasswordVerifier(passwordEncoder);
    }

    @Test
    void isANoOpWhenNoTransactionPasswordHasBeenSet() {
        Associate associate = new Associate();

        assertThatCode(() -> verifier.requireIfSet(associate, null)).doesNotThrowAnyException();
    }

    @Test
    void throwsWhenSetButNoPasswordSupplied() {
        Associate associate = new Associate();
        associate.setTransactionPasswordHash(passwordEncoder.encode("secret123"));

        assertThatThrownBy(() -> verifier.requireIfSet(associate, null))
            .isInstanceOf(InvalidTransactionPasswordException.class);
    }

    @Test
    void throwsWhenSetAndSuppliedPasswordDoesNotMatch() {
        Associate associate = new Associate();
        associate.setTransactionPasswordHash(passwordEncoder.encode("secret123"));

        assertThatThrownBy(() -> verifier.requireIfSet(associate, "wrong"))
            .isInstanceOf(InvalidTransactionPasswordException.class);
    }

    @Test
    void passesWhenSetAndSuppliedPasswordMatches() {
        Associate associate = new Associate();
        associate.setTransactionPasswordHash(passwordEncoder.encode("secret123"));

        assertThatCode(() -> verifier.requireIfSet(associate, "secret123")).doesNotThrowAnyException();
    }
}
