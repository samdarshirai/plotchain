package com.plotchain.supportticket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
class AdminSupportTicketServiceTest {

    @Mock SupportTicketRepository supportTicketRepository;
    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminSupportTicketService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminSupportTicketService(supportTicketRepository, associateRepository, audit);
    }

    private Associate associate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    @Test
    void createPersistsAnOpenTicketWithNullResponseAndEqualTimestamps() {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate()));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));

        SupportTicketResponse response = service.create(
            new CreateSupportTicketRequest(ASSOCIATE_ID, "Wallet blank", "Page is empty"), ACTOR_ID);

        ArgumentCaptor<SupportTicket> captor = ArgumentCaptor.forClass(SupportTicket.class);
        verify(supportTicketRepository).save(captor.capture());
        SupportTicket saved = captor.getValue();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getAssociateId()).isEqualTo(ASSOCIATE_ID);
        assertThat(saved.getSubject()).isEqualTo("Wallet blank");
        assertThat(saved.getDescription()).isEqualTo("Page is empty");
        assertThat(saved.getStatus()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(saved.getResponse()).isNull();
        assertThat(saved.getRespondedAt()).isNull();
        assertThat(saved.getCreatedAt()).isNotNull().isEqualTo(saved.getUpdatedAt());

        assertThat(response.id()).isEqualTo(saved.getId());
        assertThat(response.status()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Doe");
    }

    @Test
    void createRecordsAnAuditEntryUnderSupportTicketSection() {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate()));
        when(supportTicketRepository.save(any(SupportTicket.class))).thenAnswer(i -> i.getArgument(0));

        SupportTicketResponse response = service.create(
            new CreateSupportTicketRequest(ASSOCIATE_ID, "Wallet blank", "Page is empty"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog log = captor.getValue();
        assertThat(log.getSection()).isEqualTo("support-ticket");
        assertThat(log.getSummary()).isEqualTo("Logged ticket for VP00001: Wallet blank");
        assertThat(log.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(log.getDetail()).contains(response.id().toString()).contains(ASSOCIATE_ID.toString());
    }

    @Test
    void createRejectsAnAdminRoleIdBecauseLookupIsAssociateRoleOnly() {
        UUID adminId = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(adminId, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(new CreateSupportTicketRequest(adminId, "s", "d"), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(associateRepository, never()).findById(any());
        verify(supportTicketRepository, never()).save(any());
    }

    @Test
    void createThrowsAssociateNotFoundBeforeWritingAnythingForAnUnknownAssociate() {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(
            new CreateSupportTicketRequest(ASSOCIATE_ID, "s", "d"), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(supportTicketRepository, never()).save(any());
        verifyNoInteractions(settingsAuditLogRepository);
    }
}
