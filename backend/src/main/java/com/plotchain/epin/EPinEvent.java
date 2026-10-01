package com.plotchain.epin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "epin_event")
public class EPinEvent {

    @Id
    private UUID id;

    @Column(name = "epin_id", nullable = false)
    private UUID epinId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false)
    private EPinEventType eventType;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    @Column(name = "from_associate_id")
    private UUID fromAssociateId;

    @Column(name = "to_associate_id")
    private UUID toAssociateId;

    @Column(name = "at", nullable = false)
    private Instant at;

    private String note;

    public static EPinEvent of(UUID epinId, EPinEventType type, UUID actorId,
                               UUID from, UUID to, Instant at, String note) {
        EPinEvent e = new EPinEvent();
        e.id = UUID.randomUUID();
        e.epinId = epinId;
        e.eventType = type;
        e.actorId = actorId;
        e.fromAssociateId = from;
        e.toAssociateId = to;
        e.at = at;
        e.note = note;
        return e;
    }

    public UUID getId() { return id; }
    public UUID getEpinId() { return epinId; }
    public EPinEventType getEventType() { return eventType; }
    public UUID getActorId() { return actorId; }
    public UUID getFromAssociateId() { return fromAssociateId; }
    public UUID getToAssociateId() { return toAssociateId; }
    public Instant getAt() { return at; }
    public String getNote() { return note; }
}
