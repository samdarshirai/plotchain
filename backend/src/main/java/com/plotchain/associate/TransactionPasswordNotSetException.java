package com.plotchain.associate;

// Gated action attempted before any transaction password exists -> 409, UI routes to set-password.
public class TransactionPasswordNotSetException extends RuntimeException {
    public TransactionPasswordNotSetException() {
        super("Set a transaction password before performing this action");
    }
}
