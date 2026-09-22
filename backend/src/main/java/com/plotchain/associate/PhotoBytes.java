package com.plotchain.associate;

// Same shape as company.LogoBytes, kept as its own type since it belongs to a different upload
// flow (per-associate, not company-wide).
public record PhotoBytes(byte[] data, String contentType) {}
