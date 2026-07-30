package com.plotchain.payments;

public class InvalidWithdrawalConfigException extends RuntimeException {
    public InvalidWithdrawalConfigException(String message) {
        super(message);
    }
}
