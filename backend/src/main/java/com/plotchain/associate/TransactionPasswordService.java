package com.plotchain.associate;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

// Self-scoped by construction: every method takes the caller's own associateId, sourced by
// TransactionPasswordController from @AuthenticationPrincipal -- same pattern as
// AuthService.changePassword (the login-password sibling of this unit).
@Service
public class TransactionPasswordService {

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;

    private final TransactionPasswordGuard transactionPasswordGuard;

    public TransactionPasswordService(AssociateRepository associateRepository, PasswordEncoder passwordEncoder,
                                      TransactionPasswordGuard transactionPasswordGuard) {
        this.transactionPasswordGuard = transactionPasswordGuard;
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public TransactionPasswordStatusResponse getStatus(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return new TransactionPasswordStatusResponse(associate.getTransactionPasswordHash() != null);
    }

    @Transactional
    public void setPassword(UUID associateId, SetTransactionPasswordRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        // Changing an existing password: verify the current one (lockout-aware). The guard's reset
        // commits in its own transaction, so this entity's counters are stale -- cleared below.
        if (associate.getTransactionPasswordHash() != null) {
            transactionPasswordGuard.require(associateId, request.currentTransactionPassword());
        }
        if (passwordEncoder.matches(request.newTransactionPassword(), associate.getPasswordHash())) {
            throw new TransactionPasswordSameAsLoginException();
        }
        associate.setTransactionPasswordHash(passwordEncoder.encode(request.newTransactionPassword()));
        associate.setTransactionPasswordFailedAttempts(0);
        associate.setTransactionPasswordLockedUntil(null);
        associateRepository.save(associate);
    }
}
