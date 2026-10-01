package com.plotchain.epin;

import java.time.Instant;
import java.util.UUID;

public record EPinEventResponse(
    EPinEventType eventType, UUID actorId, UUID fromAssociateId, UUID toAssociateId, Instant at, String note
) {
    static EPinEventResponse from(EPinEvent e) {
        return new EPinEventResponse(e.getEventType(), e.getActorId(), e.getFromAssociateId(),
            e.getToAssociateId(), e.getAt(), e.getNote());
    }
}
