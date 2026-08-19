package com.plotchain.associate;

import java.util.UUID;

public class PositionRequiredException extends RuntimeException {
    public PositionRequiredException(UUID parentId) {
        super("Position is required when a parent is specified: parent " + parentId);
    }
}
