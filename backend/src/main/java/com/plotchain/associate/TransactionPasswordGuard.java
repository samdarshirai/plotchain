package com.plotchain.associate;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

// Single gate for every transaction-password-protected associate action. Not @Transactional on
// purpose: it only reads; all writes go through the recorder's own REQUIRES_NEW transactions.
// CALLERS MUST invoke require() BEFORE loading the Associate they later save, or that save() would
// write stale counter fields back over a reset.
@Component
public class TransactionPasswordGuard {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final TransactionPasswordAttemptRecorder recorder;
    private final Clock clock;

    public TransactionPasswordGuard(AssociateRepository associateRepository, PasswordEncoder passwordEncoder,
                                    TransactionPasswordAttemptRecorder recorder, Clock clock) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.recorder = recorder;
        this.clock = clock;
    }

    public void require(UUID associateId, String supplied) {
        Associate a = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        String hash = a.getTransactionPasswordHash();
        if (hash == null) {
            throw new TransactionPasswordNotSetException();
        }
        Instant lockedUntil = a.getTransactionPasswordLockedUntil();
        if (lockedUntil != null && lockedUntil.isAfter(clock.instant())) {
            throw new TransactionPasswordLockedException(lockedUntil);
        }
        if (supplied == null || supplied.isBlank() || !passwordEncoder.matches(supplied, hash)) {
            recorder.recordFailure(associateId);
            throw new InvalidTransactionPasswordException("Transaction password is incorrect");
        }
        if (a.getTransactionPasswordFailedAttempts() > 0 || lockedUntil != null) {
            recorder.reset(associateId);
        }
    }
}
