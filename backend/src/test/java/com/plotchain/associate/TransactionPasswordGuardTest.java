package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TransactionPasswordGuardTest {

    static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");
    PasswordEncoder encoder = new BCryptPasswordEncoder();
    AssociateRepository repo = mock(AssociateRepository.class);
    TransactionPasswordAttemptRecorder recorder = mock(TransactionPasswordAttemptRecorder.class);
    TransactionPasswordGuard guard =
        new TransactionPasswordGuard(repo, encoder, recorder, Clock.fixed(NOW, ZoneOffset.UTC));
    UUID id = UUID.randomUUID();
    Associate associate = new Associate();

    @BeforeEach
    void setUp() {
        when(repo.findById(id)).thenReturn(Optional.of(associate));
    }

    @Test
    void throwsNotSetWhenNoHash() {
        assertThatThrownBy(() -> guard.require(id, "secret123"))
            .isInstanceOf(TransactionPasswordNotSetException.class);
        verify(recorder, never()).recordFailure(id);
    }

    @Test
    void throwsLockedWhileLockActive() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));
        associate.setTransactionPasswordLockedUntil(NOW.plusSeconds(10));

        assertThatThrownBy(() -> guard.require(id, "secret123"))
            .isInstanceOf(TransactionPasswordLockedException.class);
        verify(recorder, never()).recordFailure(id);
    }

    @Test
    void wrongPasswordRecordsFailureAndThrowsInvalid() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));

        assertThatThrownBy(() -> guard.require(id, "wrong"))
            .isInstanceOf(InvalidTransactionPasswordException.class);
        verify(recorder).recordFailure(id);
    }

    @Test
    void nullAndBlankCountAsFailures() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));

        assertThatThrownBy(() -> guard.require(id, null)).isInstanceOf(InvalidTransactionPasswordException.class);
        assertThatThrownBy(() -> guard.require(id, "   ")).isInstanceOf(InvalidTransactionPasswordException.class);
        verify(recorder, org.mockito.Mockito.times(2)).recordFailure(id);
    }

    @Test
    void correctPasswordWithCleanStateDoesNotTouchRecorder() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));

        assertThatCode(() -> guard.require(id, "secret123")).doesNotThrowAnyException();
        verify(recorder, never()).reset(id);
    }

    @Test
    void correctPasswordResetsDirtyCounter() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));
        associate.setTransactionPasswordFailedAttempts(3);

        guard.require(id, "secret123");

        verify(recorder).reset(id);
    }

    @Test
    void expiredLockIsTreatedAsUnlockedAndCleared() {
        associate.setTransactionPasswordHash(encoder.encode("secret123"));
        associate.setTransactionPasswordLockedUntil(NOW.minusSeconds(1));

        assertThatCode(() -> guard.require(id, "secret123")).doesNotThrowAnyException();
        verify(recorder).reset(id);
    }
}
