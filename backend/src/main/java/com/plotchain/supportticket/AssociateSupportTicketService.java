package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

// Read-only, self-scoped history. Reuses the unit-2 searchQueue query (status + associateId
// filters, createdAt DESC order) with associateId always set, so no new repository method is
// needed. Every row belongs to associateId, so one Associate lookup serves every row's name/userId.
@Service
public class AssociateSupportTicketService {

    private final SupportTicketRepository supportTicketRepository;
    private final AssociateRepository associateRepository;

    public AssociateSupportTicketService(SupportTicketRepository supportTicketRepository,
                                         AssociateRepository associateRepository) {
        this.supportTicketRepository = supportTicketRepository;
        this.associateRepository = associateRepository;
    }

    @Transactional(readOnly = true)
    public SupportTicketPageResponse myTickets(UUID associateId, SupportTicketStatus status, int page, int size) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        Page<SupportTicket> result =
            supportTicketRepository.searchQueue(status, associateId, PageRequest.of(page, size));
        return new SupportTicketPageResponse(
            result.getContent().stream().map(t -> SupportTicketResponse.of(t, associate)).toList(),
            page, size, result.getTotalElements());
    }
}
