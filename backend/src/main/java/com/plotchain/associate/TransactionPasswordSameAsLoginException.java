package com.plotchain.associate;

public class TransactionPasswordSameAsLoginException extends RuntimeException {
    public TransactionPasswordSameAsLoginException() {
        super("Transaction password must differ from your login password");
    }
}
