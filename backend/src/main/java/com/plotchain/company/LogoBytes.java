package com.plotchain.company;

// Internal transport only -- never serialized directly. The controller converts this into a
// ResponseEntity<byte[]> with the stored content type.
record LogoBytes(byte[] data, String contentType) {}
