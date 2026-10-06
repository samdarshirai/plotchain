package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class AdminSupportTicketService {

    private final SupportTicketRepository supportTicketRepository;
    private final AssociateRepository associateRepository;
    private final SettingsAuditService settingsAuditService;

    public AdminSupportTicketService(SupportTicketRepository supportTicketRepository,
                                      AssociateRepository associateRepository,
                                      SettingsAuditService settingsAuditService) {
        this.supportTicketRepository = supportTicketRepository;
        this.associateRepository = associateRepository;
        this.settingsAuditService = settingsAuditService;
    }

    @Transactional
    public SupportTicketResponse create(CreateSupportTicketRequest request, UUID actorId) {
        // Target lookup first, before any write (same findOrThrow-first ordering as
        // KycReviewService.decide): an unknown associateId must 404 and leave no ticket/audit row.
        Associate associate = associateRepository.findByIdAndRole(request.associateId(), AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        Instant now = Instant.now();
        SupportTicket ticket = new SupportTicket();
        ticket.setId(UUID.randomUUID());
        ticket.setAssociateId(associate.getId());
        ticket.setSubject(request.subject());
        ticket.setDescription(request.description());
        ticket.setStatus(SupportTicketStatus.OPEN);
        ticket.setCreatedAt(now);
        ticket.setUpdatedAt(now);
        SupportTicket saved = supportTicketRepository.save(ticket);

        settingsAuditService.record("support-ticket",
            "Logged ticket for " + associate.getUserId() + ": " + request.subject(),
            Map.of("ticketId", saved.getId().toString(), "associateId", associate.getId().toString()),
            actorId);

        return SupportTicketResponse.of(saved, associate);
    }
}
