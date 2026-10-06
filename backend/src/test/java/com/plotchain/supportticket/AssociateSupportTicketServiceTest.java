package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateSupportTicketServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;

    AssociateSupportTicketService service;

    static final UUID ME = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateSupportTicketService(supportTicketRepository, associateRepository);
    }

    private Associate me() {
        Associate a = new Associate();
        a.setId(ME);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        return a;
    }

    private SupportTicket ticket(SupportTicketStatus status) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(ME);
        t.setSubject("Subject");
        t.setDescription("Desc");
        t.setStatus(status);
        t.setResponse("Done");
        t.setRespondedAt(Instant.parse("2026-10-01T00:00:00Z"));
        t.setCreatedAt(Instant.parse("2026-09-30T00:00:00Z"));
        t.setUpdatedAt(Instant.parse("2026-10-01T00:00:00Z"));
        return t;
    }

    @Test
    void myTicketsQueriesByCallerIdOnlyAndMapsRowsWithAssociateNameAndUserId() {
        SupportTicket t = ticket(SupportTicketStatus.RESOLVED);
        when(associateRepository.findById(ME)).thenReturn(Optional.of(me()));
        when(supportTicketRepository.searchQueue(null, ME, PageRequest.of(2, 20)))
            .thenReturn(new PageImpl<>(List.of(t), PageRequest.of(2, 20), 41));

        SupportTicketPageResponse result = service.myTickets(ME, null, 2, 20);

        assertThat(result.page()).isEqualTo(2);
        assertThat(result.size()).isEqualTo(20);
        assertThat(result.totalElements()).isEqualTo(41);
        assertThat(result.entries()).hasSize(1);
        SupportTicketResponse row = result.entries().get(0);
        assertThat(row.id()).isEqualTo(t.getId());
        assertThat(row.associateId()).isEqualTo(ME);
        assertThat(row.associateUserId()).isEqualTo("VP00001");
        assertThat(row.associateName()).isEqualTo("Jane Doe");
        assertThat(row.status()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(row.response()).isEqualTo("Done");
        assertThat(row.respondedAt()).isEqualTo(t.getRespondedAt());
    }

    @Test
    void myTicketsPassesTheStatusFilterThrough() {
        when(associateRepository.findById(ME)).thenReturn(Optional.of(me()));
        when(supportTicketRepository.searchQueue(SupportTicketStatus.OPEN, ME, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(ticket(SupportTicketStatus.OPEN))));

        assertThat(service.myTickets(ME, SupportTicketStatus.OPEN, 0, 20).entries()).hasSize(1);
    }

    @Test
    void myTicketsForAnAssociateWithNoTicketsReturnsAnEmptyPageNotAnError() {
        when(associateRepository.findById(ME)).thenReturn(Optional.of(me()));
        when(supportTicketRepository.searchQueue(null, ME, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        SupportTicketPageResponse result = service.myTickets(ME, null, 0, 20);

        assertThat(result.entries()).isEmpty();
        assertThat(result.totalElements()).isZero();
    }

    @Test
    void myTicketsThrowsAssociateNotFoundWhenThePrincipalHasNoAssociateRow() {
        when(associateRepository.findById(ME)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.myTickets(ME, null, 0, 20))
            .isInstanceOf(AssociateNotFoundException.class);
        verify(supportTicketRepository, never()).searchQueue(any(), any(), any());
    }
}
