package com.plotchain.associate;

public class NoRankTiersConfiguredException extends RuntimeException {
    public NoRankTiersConfiguredException() {
        super("No rank tiers are configured; an associate cannot be created without a rank");
    }
}
