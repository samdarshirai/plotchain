package com.plotchain.associate;

// Thrown by TransactionPasswordVerifier when a save requires the transaction password (one has
// already been set) and the supplied value is missing or doesn't match -- same "one failure
// mode, one exception" shape as InvalidKycUploadException/InvalidLogoUploadException, mapped to
// 401 (not 400) since this is a credential check, same status as auth.InvalidCredentialsException.
public class InvalidTransactionPasswordException extends RuntimeException {
    public InvalidTransactionPasswordException(String message) {
        super(message);
    }
}
