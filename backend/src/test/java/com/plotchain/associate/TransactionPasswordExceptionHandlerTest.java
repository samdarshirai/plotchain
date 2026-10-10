package com.plotchain.associate;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TransactionPasswordExceptionHandlerTest {

    TransactionPasswordExceptionHandler handler = new TransactionPasswordExceptionHandler();

    @Test
    void notSetMapsTo409WithCode() {
        ResponseEntity<Map<String, String>> res = handler.handleNotSet(new TransactionPasswordNotSetException());

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody()).containsEntry("code", "TRANSACTION_PASSWORD_NOT_SET");
    }

    @Test
    void lockedMapsTo423WithCodeAndLockedUntil() {
        Instant until = Instant.parse("2026-10-10T12:30:00Z");

        ResponseEntity<Map<String, String>> res = handler.handleLocked(new TransactionPasswordLockedException(until));

        assertThat(res.getStatusCode().value()).isEqualTo(423);
        assertThat(res.getBody()).containsEntry("code", "TRANSACTION_PASSWORD_LOCKED")
            .containsEntry("lockedUntil", "2026-10-10T12:30:00Z");
    }
}
