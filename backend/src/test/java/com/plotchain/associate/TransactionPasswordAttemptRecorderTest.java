package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TransactionPasswordAttemptRecorderTest {

    static final Instant NOW = Instant.parse("2026-10-10T12:00:00Z");
    AssociateRepository repo = mock(AssociateRepository.class);
    TransactionPasswordAttemptRecorder recorder =
        new TransactionPasswordAttemptRecorder(repo, Clock.fixed(NOW, ZoneOffset.UTC));
    UUID id = UUID.randomUUID();
    Associate associate = new Associate();

    @BeforeEach
    void setUp() {
        when(repo.findByIdForUpdate(id)).thenReturn(Optional.of(associate));
    }

    @Test
    void failureIncrementsCounter() {
        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isEqualTo(1);
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
    }

    @Test
    void fifthFailureLocksForThirtyMinutesAndResetsCounter() {
        associate.setTransactionPasswordFailedAttempts(4);

        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordLockedUntil()).isEqualTo(NOW.plusSeconds(30 * 60));
        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
    }

    @Test
    void failureWhileAlreadyLockedChangesNothing() {
        associate.setTransactionPasswordLockedUntil(NOW.plusSeconds(60));

        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    void failureAfterExpiredLockStartsFreshCount() {
        associate.setTransactionPasswordLockedUntil(NOW.minusSeconds(1));
        associate.setTransactionPasswordFailedAttempts(0);

        recorder.recordFailure(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isEqualTo(1);
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
    }

    @Test
    void resetClearsCounterAndLock() {
        associate.setTransactionPasswordFailedAttempts(3);
        associate.setTransactionPasswordLockedUntil(NOW.minusSeconds(5));

        recorder.reset(id);

        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
    }
}
