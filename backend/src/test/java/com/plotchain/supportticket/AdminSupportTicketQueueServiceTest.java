package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminSupportTicketQueueServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminSupportTicketService service;

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminSupportTicketService(supportTicketRepository, associateRepository, audit);
    }

    private Associate associate(UUID id, String userId, String name) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName(name);
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    private SupportTicket ticket(UUID associateId, String subject, SupportTicketStatus status, String response) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject(subject);
        t.setDescription("desc of " + subject);
        t.setStatus(status);
        t.setResponse(response);
        t.setRespondedAt(response == null ? null : Instant.parse("2026-06-02T00:00:00Z"));
        t.setCreatedAt(Instant.parse("2026-06-01T00:00:00Z"));
        t.setUpdatedAt(Instant.parse("2026-06-02T00:00:00Z"));
        return t;
    }

    @Test
    void listMapsFullRowsAndLooksUpAssociatesInOneQuery() {
        UUID a1 = UUID.randomUUID();
        UUID a2 = UUID.randomUUID();
        SupportTicket t1 = ticket(a1, "Wallet blank", SupportTicketStatus.OPEN, null);
        SupportTicket t2 = ticket(a2, "KYC stuck", SupportTicketStatus.RESOLVED, "Fixed");
        SupportTicket t3 = ticket(a1, "Another", SupportTicketStatus.CLOSED, "Done");
        when(supportTicketRepository.searchQueue(eq(null), eq(null), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(t1, t2, t3), PageRequest.of(0, 20), 57));
        when(associateRepository.findAllById(any())).thenReturn(
            List.of(associate(a1, "VP00001", "Jane Doe"), associate(a2, "VP00002", "John Roe")));

        SupportTicketPageResponse page = service.list(null, null, 0, 20);

        assertThat(page.page()).isEqualTo(0);
        assertThat(page.size()).isEqualTo(20);
        assertThat(page.totalElements()).isEqualTo(57);
        assertThat(page.entries()).extracting(SupportTicketResponse::subject)
            .containsExactly("Wallet blank", "KYC stuck", "Another");           // repository order preserved
        SupportTicketResponse first = page.entries().get(0);
        assertThat(first.associateUserId()).isEqualTo("VP00001");
        assertThat(first.associateName()).isEqualTo("Jane Doe");
        assertThat(first.description()).isEqualTo("desc of Wallet blank");
        assertThat(first.response()).isNull();
        SupportTicketResponse second = page.entries().get(1);
        assertThat(second.associateName()).isEqualTo("John Roe");
        assertThat(second.status()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(second.response()).isEqualTo("Fixed");
        assertThat(second.respondedAt()).isEqualTo(Instant.parse("2026-06-02T00:00:00Z"));
        verify(associateRepository).findAllById(any());                          // exactly one lookup for the whole page
    }

    @Test
    void listPassesBothFiltersAndAnUnsortedPageableToTheRepository() {
        UUID a1 = UUID.randomUUID();
        when(supportTicketRepository.searchQueue(eq(SupportTicketStatus.OPEN), eq(a1), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(2, 5), 0));

        SupportTicketPageResponse page = service.list(SupportTicketStatus.OPEN, a1, 2, 5);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(supportTicketRepository).searchQueue(eq(SupportTicketStatus.OPEN), eq(a1), captor.capture());
        assertThat(captor.getValue().getPageNumber()).isEqualTo(2);
        assertThat(captor.getValue().getPageSize()).isEqualTo(5);
        assertThat(captor.getValue().getSort().isUnsorted()).isTrue();           // order is inside searchQueue
        assertThat(page.page()).isEqualTo(2);
        assertThat(page.size()).isEqualTo(5);
    }

    @Test
    void emptyPageSkipsTheAssociateLookupAndReturnsAnEmptyList() {
        when(supportTicketRepository.searchQueue(eq(null), eq(null), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        SupportTicketPageResponse page = service.list(null, null, 0, 20);

        assertThat(page.entries()).isEmpty();
        assertThat(page.totalElements()).isZero();
        verify(associateRepository, never()).findAllById(any());
    }

    @Test
    void listFailsLoudlyIfATicketsAssociateIsMissing() {
        // The FK makes this impossible in production; a silent null name would hide corruption.
        UUID a1 = UUID.randomUUID();
        when(supportTicketRepository.searchQueue(eq(null), eq(null), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(ticket(a1, "x", SupportTicketStatus.OPEN, null)), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(any())).thenReturn(List.of());

        assertThatThrownBy(() -> service.list(null, null, 0, 20)).isInstanceOf(IllegalStateException.class);
    }
}
