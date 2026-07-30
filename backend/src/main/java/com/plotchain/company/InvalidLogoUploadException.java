package com.plotchain.company;

// Covers both "empty file" and "unsupported content type" -- one failure mode ("this isn't an
// acceptable logo file"), one exception, rather than a class per validation rule.
public class InvalidLogoUploadException extends RuntimeException {
    public InvalidLogoUploadException(String message) {
        super(message);
    }
}
