package com.plotchain.supportticket;

import com.plotchain.associate.Associate;

import java.time.Instant;
import java.util.UUID;

// One shape for admin queue rows and the associate's own history rows (spec Decision 5: no
// summary/detail split). Units 2-4 build rows with of(ticket, associate).
public record SupportTicketResponse(
    UUID id,
    UUID associateId,
    String associateUserId,
    String associateName,
    String subject,
    String description,
    SupportTicketStatus status,
    String response,
    Instant respondedAt,
    Instant createdAt,
    Instant updatedAt
) {
    public static SupportTicketResponse of(SupportTicket t, Associate a) {
        return new SupportTicketResponse(t.getId(), t.getAssociateId(), a.getUserId(), a.getName(),
            t.getSubject(), t.getDescription(), t.getStatus(), t.getResponse(), t.getRespondedAt(),
            t.getCreatedAt(), t.getUpdatedAt());
    }
}
