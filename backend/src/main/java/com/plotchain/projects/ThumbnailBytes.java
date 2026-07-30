package com.plotchain.projects;

// Internal transport only -- never serialized directly. The controller converts this into a
// ResponseEntity<byte[]> with the stored content type.
record ThumbnailBytes(byte[] data, String contentType) {}
