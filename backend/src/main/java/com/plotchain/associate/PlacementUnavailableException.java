package com.plotchain.associate;

import java.util.UUID;

public class PlacementUnavailableException extends RuntimeException {
    public PlacementUnavailableException(UUID parentId, String position) {
        super("Placement already occupied: parent " + parentId + " position " + position);
    }
}
