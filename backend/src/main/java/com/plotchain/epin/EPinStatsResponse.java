package com.plotchain.epin;

// Counts over ALL pins of a type. Blocked pins count only toward generated.
public record EPinStatsResponse(Counts topup, Counts registration) {
    public record Counts(long generated, long used, long allocated, long unused) {}
}
