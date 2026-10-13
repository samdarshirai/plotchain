package com.plotchain.epin;

// PAN or Aadhaar already registered. Mapped to 409 with code PAN_TAKEN / AADHAAR_TAKEN.
public class EPinDuplicateIdentityException extends RuntimeException {
    private final String code;

    public EPinDuplicateIdentityException(String code) {
        super(code);
        this.code = code;
    }

    public String getCode() { return code; }
}
