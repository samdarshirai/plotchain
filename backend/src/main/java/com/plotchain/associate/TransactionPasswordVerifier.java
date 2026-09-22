package com.plotchain.associate;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

// Shared by AssociateProfileService.updateProfile and AssociateNomineeService.updateNominee: both
// saves are gated by the mockup's "AUTHORISATION" section, which requires the transaction
// password once one has been set. No-op (bootstrapping case) when the associate has never set a
// transaction password yet -- transactionPasswordHash is null until TransactionPasswordService
// sets one for the first time.
@Component
public class TransactionPasswordVerifier {

    private final PasswordEncoder passwordEncoder;

    public TransactionPasswordVerifier(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    public void requireIfSet(Associate associate, String suppliedPassword) {
        String hash = associate.getTransactionPasswordHash();
        if (hash == null) {
            return;
        }
        if (suppliedPassword == null || suppliedPassword.isBlank()
                || !passwordEncoder.matches(suppliedPassword, hash)) {
            throw new InvalidTransactionPasswordException("Transaction password is required to save these changes");
        }
    }
}
