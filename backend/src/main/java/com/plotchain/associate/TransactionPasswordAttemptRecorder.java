package com.plotchain.associate;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

// Separate bean (not a method on the guard) so @Transactional(REQUIRES_NEW) goes through the Spring
// proxy: the counter write must commit even when the caller's transaction rolls back because the
// gated request failed. findByIdForUpdate serializes concurrent wrong attempts.
@Component
public class TransactionPasswordAttemptRecorder {

    static final int MAX_ATTEMPTS = 5;
    static final long LOCK_SECONDS = 30 * 60;

    private final AssociateRepository associateRepository;
    private final Clock clock;

    public TransactionPasswordAttemptRecorder(AssociateRepository associateRepository, Clock clock) {
        this.associateRepository = associateRepository;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UUID associateId) {
        Associate a = associateRepository.findByIdForUpdate(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        Instant now = clock.instant();
        Instant lockedUntil = a.getTransactionPasswordLockedUntil();
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            return; // a concurrent attempt already locked it
        }
        a.setTransactionPasswordLockedUntil(null);
        int attempts = a.getTransactionPasswordFailedAttempts() + 1;
        if (attempts >= MAX_ATTEMPTS) {
            a.setTransactionPasswordLockedUntil(now.plusSeconds(LOCK_SECONDS));
            attempts = 0;
        }
        a.setTransactionPasswordFailedAttempts(attempts);
        associateRepository.save(a);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void reset(UUID associateId) {
        Associate a = associateRepository.findByIdForUpdate(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        a.setTransactionPasswordFailedAttempts(0);
        a.setTransactionPasswordLockedUntil(null);
        associateRepository.save(a);
    }
}
