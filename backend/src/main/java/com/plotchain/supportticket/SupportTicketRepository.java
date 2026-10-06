package com.plotchain.supportticket;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Query methods (searchQueue, findByAssociateId...) are added by units 2 and 4.
public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {
}
