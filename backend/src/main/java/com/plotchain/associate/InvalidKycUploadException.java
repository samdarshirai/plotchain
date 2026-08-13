package com.plotchain.associate;

// Covers "no documentType", "documentType too long", "empty file", and "unsupported content
// type" -- one failure mode ("this isn't an acceptable KYC document submission"), one
// exception, same shape as company.InvalidLogoUploadException for the logo-upload case.
public class InvalidKycUploadException extends RuntimeException {
    public InvalidKycUploadException(String message) {
        super(message);
    }
}
