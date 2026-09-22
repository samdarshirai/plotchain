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

    public TransactionPasswordService(AssociateRepository associateRepository, PasswordEncoder passwordEncoder) {
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

        // Bootstrapping (no transaction password set yet): currentTransactionPassword is
        // ignored, matching TransactionPasswordVerifier.requireIfSet's own no-op-when-null rule.
        // Once set, changing it requires the current one to match, same as AuthService.changePassword.
        if (associate.getTransactionPasswordHash() != null) {
            if (request.currentTransactionPassword() == null || request.currentTransactionPassword().isBlank()
                    || !passwordEncoder.matches(request.currentTransactionPassword(), associate.getTransactionPasswordHash())) {
                throw new InvalidTransactionPasswordException("Current transaction password is incorrect");
            }
        }

        associate.setTransactionPasswordHash(passwordEncoder.encode(request.newTransactionPassword()));
        associateRepository.save(associate);
    }
}
