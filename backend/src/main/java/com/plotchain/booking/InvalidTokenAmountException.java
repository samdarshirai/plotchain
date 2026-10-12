package com.plotchain.booking;

import java.math.BigDecimal;

// Token must be above zero and below the payable total (a token equal to the price would be a full
// payment, which is a Sale, not a booking). Mapped to 400 in BookingExceptionHandler.
public class InvalidTokenAmountException extends RuntimeException {
    public InvalidTokenAmountException(BigDecimal token, BigDecimal price) {
        super("Token amount " + token.toPlainString() + " must be above 0 and below the payable total " + price.toPlainString());
    }
}
