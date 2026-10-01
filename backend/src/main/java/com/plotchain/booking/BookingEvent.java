package com.plotchain.booking;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "booking_event")
public class BookingEvent {

    @Id
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingEventType type;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    private String detail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected BookingEvent() {}

    public static BookingEvent of(UUID bookingId, BookingEventType type, UUID actorId, String detail, Instant createdAt) {
        BookingEvent e = new BookingEvent();
        e.id = UUID.randomUUID();
        e.bookingId = bookingId;
        e.type = type;
        e.actorId = actorId;
        e.detail = detail;
        e.createdAt = createdAt;
        return e;
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public BookingEventType getType() { return type; }
    public UUID getActorId() { return actorId; }
    public String getDetail() { return detail; }
    public Instant getCreatedAt() { return createdAt; }
}
