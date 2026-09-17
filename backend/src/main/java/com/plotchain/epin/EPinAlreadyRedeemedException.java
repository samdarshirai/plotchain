package com.plotchain.epin;

import java.util.UUID;

public class EPinAlreadyRedeemedException extends RuntimeException {
    public EPinAlreadyRedeemedException(UUID epinId) {
        super("E-PIN is already redeemed: " + epinId);
    }
}
