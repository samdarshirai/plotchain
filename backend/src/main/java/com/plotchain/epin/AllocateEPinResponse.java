package com.plotchain.epin;

import java.util.List;
import java.util.UUID;

public record AllocateEPinResponse(UUID associateId, int count, List<Item> pins) {
    public record Item(UUID id, String code) {}
}
