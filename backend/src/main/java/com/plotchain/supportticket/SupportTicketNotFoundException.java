package com.plotchain.supportticket;

import java.util.UUID;

public class SupportTicketNotFoundException extends RuntimeException {
    public SupportTicketNotFoundException(UUID id) {
        super("Support ticket not found: " + id);
    }
}
