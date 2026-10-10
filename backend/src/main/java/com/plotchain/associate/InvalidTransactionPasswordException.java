package com.plotchain.associate;

// Thrown by TransactionPasswordGuard when the supplied transaction password is missing or wrong
// -- same "one failure
// mode, one exception" shape as InvalidKycUploadException/InvalidLogoUploadException, mapped to
// 401 (not 400) since this is a credential check, same status as auth.InvalidCredentialsException.
public class InvalidTransactionPasswordException extends RuntimeException {
    public InvalidTransactionPasswordException(String message) {
        super(message);
    }
}
