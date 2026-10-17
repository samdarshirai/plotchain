package com.plotchain.booking;

import jakarta.persistence.*;
import java.math.BigDecimal;
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

    // Plot-transfer snapshot (V62); null on every other event type.
    @Column(name = "old_plot_id")
    private UUID oldPlotId;

    @Column(name = "new_plot_id")
    private UUID newPlotId;

    @Column(name = "paid_amount")
    private BigDecimal paidAmount;

    @Column(name = "rest_amount")
    private BigDecimal restAmount;

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

    public static BookingEvent plotTransfer(UUID bookingId, UUID actorId, String detail, Instant createdAt,
                                            UUID oldPlotId, UUID newPlotId, BigDecimal paid, BigDecimal rest) {
        BookingEvent e = of(bookingId, BookingEventType.PLOT_TRANSFERRED, actorId, detail, createdAt);
        e.oldPlotId = oldPlotId;
        e.newPlotId = newPlotId;
        e.paidAmount = paid;
        e.restAmount = rest;
        return e;
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public BookingEventType getType() { return type; }
    public UUID getActorId() { return actorId; }
    public String getDetail() { return detail; }
    public Instant getCreatedAt() { return createdAt; }
}
