package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Mocked-repository tests can never exercise chk_settings_audit_log_section (same gap as
// KycReviewServiceIntegrationTest): create/respond audited under a section the CHECK rejected
// and 409'd on a migrated DB. This runs the real service, audit service and migrations.
@SpringBootTest
@ActiveProfiles("test")
class AdminSupportTicketAuditIntegrationTest {

    @Autowired AdminSupportTicketService service;
    @Autowired AssociateRepository associateRepository;
    @Autowired SupportTicketRepository supportTicketRepository;
    @Autowired SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    private UUID adminId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        if (adminId != null) {
            settingsAuditLogRepository.deleteAll(auditRows());
        }
        if (associateId != null) {
            supportTicketRepository.deleteAll(
                supportTicketRepository.findAll().stream()
                    .filter(t -> associateId.equals(t.getAssociateId())).toList());
            associateRepository.deleteById(associateId);
        }
        if (adminId != null) {
            associateRepository.deleteById(adminId);
        }
    }

    private List<SettingsAuditLog> auditRows() {
        return settingsAuditLogRepository.findAll().stream()
            .filter(row -> adminId.equals(row.getChangedByAssociateId()))
            .toList();
    }

    private UUID seed(AssociateRole role, String userId) {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setName(userId);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setUserId(userId);
        a.setEmail(id + "@test.local");
        a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        a.setRole(role);
        if (role == AssociateRole.ASSOCIATE) {
            a.setRankId(SILVER_RANK_ID); // V13 lowest seeded rank; CHK_ASSOCIATE_RANK_REQUIRED
        }
        associateRepository.saveAndFlush(a);
        return id;
    }

    @Test
    void createAndRespondRecordAuditRowsWithTheSupportTicketSection() {
        adminId = seed(AssociateRole.ADMIN, "tk-admin-" + UUID.randomUUID());
        associateId = seed(AssociateRole.ASSOCIATE, "tk-assoc-" + UUID.randomUUID());

        SupportTicketResponse created = service.create(
            new CreateSupportTicketRequest(associateId, "Wrong bank", "Please fix"), adminId);
        service.respond(created.id(), new RespondToSupportTicketRequest(SupportTicketStatus.RESOLVED, "Fixed"), adminId);

        List<SettingsAuditLog> rows = auditRows();
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(SettingsAuditLog::getSection).containsOnly("SUPPORT_TICKET");
    }
}
