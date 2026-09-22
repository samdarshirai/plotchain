package com.plotchain.associate;

// Covers both "empty file" and "unsupported content type" -- one failure mode ("this isn't an
// acceptable photo file"), one exception, same shape as company.InvalidLogoUploadException for
// the logo-upload case.
public class InvalidPhotoUploadException extends RuntimeException {
    public InvalidPhotoUploadException(String message) {
        super(message);
    }
}
