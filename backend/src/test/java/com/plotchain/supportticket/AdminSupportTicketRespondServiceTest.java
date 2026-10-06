package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminSupportTicketRespondServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminSupportTicketService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID TICKET_ID = UUID.randomUUID();
    private static final Instant OLD = Instant.now().minus(2, ChronoUnit.DAYS);

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminSupportTicketService(supportTicketRepository, associateRepository, audit);
    }

    private SupportTicket ticket(SupportTicketStatus status, String response, Instant respondedAt) {
        SupportTicket t = new SupportTicket();
        t.setId(TICKET_ID);
        t.setAssociateId(ASSOCIATE_ID);
        t.setSubject("Wallet blank");
        t.setDescription("Page is empty");
        t.setStatus(status);
        t.setResponse(response);
        t.setRespondedAt(respondedAt);
        t.setCreatedAt(OLD);
        t.setUpdatedAt(OLD);
        return t;
    }

    private void stubFound(SupportTicket t) {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(t));
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(a));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void respondSetsStatusResponseRespondedAtAndUpdatedAtAndReturnsTheTicketRow() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        SupportTicketResponse out = service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "Fixed, please retry"), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        SupportTicket saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(saved.getResponse()).isEqualTo("Fixed, please retry");
        assertThat(saved.getRespondedAt()).isNotNull().isAfter(OLD);
        assertThat(saved.getUpdatedAt()).isAfter(OLD);
        assertThat(saved.getCreatedAt()).isEqualTo(OLD);

        assertThat(out.id()).isEqualTo(TICKET_ID);
        assertThat(out.status()).isEqualTo(SupportTicketStatus.RESOLVED);
        assertThat(out.response()).isEqualTo("Fixed, please retry");
        assertThat(out.associateUserId()).isEqualTo("VP00001");
        assertThat(out.associateName()).isEqualTo("Jane Doe");
    }

    @Test
    void aNewReplyReplacesThePreviousReplyAndRefreshesRespondedAt() {
        stubFound(ticket(SupportTicketStatus.IN_PROGRESS, "old reply", OLD));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, "new reply"), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        assertThat(captor.getValue().getResponse()).isEqualTo("new reply");
        assertThat(captor.getValue().getRespondedAt()).isAfter(OLD);
    }

    @Test
    void statusOnlyChangeKeepsExistingResponseAndRespondedAtButBumpsUpdatedAt() {
        stubFound(ticket(SupportTicketStatus.OPEN, "old reply", OLD));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, null), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        SupportTicket saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(SupportTicketStatus.IN_PROGRESS);
        assertThat(saved.getResponse()).isEqualTo("old reply");
        assertThat(saved.getRespondedAt()).isEqualTo(OLD);
        assertThat(saved.getUpdatedAt()).isAfter(OLD);
    }

    @Test
    void whitespaceOnlyResponseOnANonTerminalStatusIsTreatedAsNotProvided() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, "   "), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        assertThat(captor.getValue().getResponse()).isNull();
        assertThat(captor.getValue().getRespondedAt()).isNull();
    }

    @Test
    void reopeningAResolvedTicketWithoutAResponseIsAllowed() {
        stubFound(ticket(SupportTicketStatus.RESOLVED, "done", OLD));

        SupportTicketResponse out = service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.OPEN, null), ACTOR_ID);

        assertThat(out.status()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(out.response()).isEqualTo("done");
    }

    @ParameterizedTest
    @EnumSource(value = SupportTicketStatus.class, names = {"RESOLVED", "CLOSED"})
    void resolvedOrClosedWithANullResponseIsRejectedAndWritesNothing(SupportTicketStatus status) {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(ticket(SupportTicketStatus.OPEN, "older reply", OLD)));

        assertThatThrownBy(() -> service.respond(TICKET_ID, new RespondToSupportTicketRequest(status, null), ACTOR_ID))
            .isInstanceOf(InvalidSupportTicketResponseException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\n\t"})
    void resolvedWithABlankResponseIsRejectedAndWritesNothing(String blank) {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.of(ticket(SupportTicketStatus.OPEN, null, null)));

        assertThatThrownBy(() -> service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, blank), ACTOR_ID))
            .isInstanceOf(InvalidSupportTicketResponseException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }

    @Test
    void unknownTicketThrowsNotFoundAndWritesNothing() {
        when(supportTicketRepository.findById(TICKET_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.respond(TICKET_ID,
            new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, null), ACTOR_ID))
            .isInstanceOf(SupportTicketNotFoundException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }

    @Test
    void respondAuditsUnderSupportTicketWithNewStatusAndResponse() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "Fixed"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog log = captor.getValue();
        assertThat(log.getSection()).isEqualTo("SUPPORT_TICKET");
        assertThat(log.getSummary()).isEqualTo("Responded to ticket " + TICKET_ID + " for VP00001: status RESOLVED");
        assertThat(log.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(log.getDetail()).contains(TICKET_ID.toString()).contains("RESOLVED").contains("Fixed");
    }

    @Test
    void auditTruncatesALongResponseTo200Chars() {
        stubFound(ticket(SupportTicketStatus.OPEN, null, null));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "x".repeat(500)), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getDetail()).contains("x".repeat(200)).doesNotContain("x".repeat(201));
    }

    @Test
    void auditForAStatusOnlyChangeHasNoResponseKey() {
        stubFound(ticket(SupportTicketStatus.OPEN, "old reply", OLD));

        service.respond(TICKET_ID, new RespondToSupportTicketRequest(SupportTicketStatus.IN_PROGRESS, null), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getDetail()).contains("IN_PROGRESS").doesNotContain("response").doesNotContain("old reply");
    }
}
