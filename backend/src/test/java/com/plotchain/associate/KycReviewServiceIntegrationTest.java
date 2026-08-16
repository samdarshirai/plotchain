package com.plotchain.associate;

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

// M2 fix: end-to-end proof that KycReviewService.decide() no longer 409s, against the real H2
// (MODE=PostgreSQL) test datasource and the real SettingsAuditService/SettingsAuditLogRepository
// -- none of which are mocked here, unlike KycReviewServiceTest (Mockito, mocked
// SettingsAuditLogRepository) and KycReviewControllerTest (@MockBean SettingsAuditLogRepository).
// A mocked repository can never exercise chk_settings_audit_log_section, so before the V23
// migration + KycReviewService's "kyc" -> "KYC" fix, every decide() call here threw
// DataIntegrityViolationException, the exact 409 described in the QA report -- and neither of
// those two existing test files would have caught it.
@SpringBootTest
@ActiveProfiles("test")
class KycReviewServiceIntegrationTest {

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank.
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    @Autowired KycReviewService kycReviewService;
    @Autowired AssociateRepository associateRepository;
    @Autowired AssociateKycDocumentRepository associateKycDocumentRepository;
    @Autowired SettingsAuditLogRepository settingsAuditLogRepository;

    private UUID associateId;
    private UUID actorId;

    @AfterEach
    void cleanUp() {
        if (associateId != null) {
            associateKycDocumentRepository.deleteAll(
                associateKycDocumentRepository.findByAssociateIdOrderByDocumentTypeAsc(associateId));
        }
        if (actorId != null) {
            settingsAuditLogRepository.deleteAll(settingsAuditLogRepository.findAll().stream()
                .filter(row -> actorId.equals(row.getChangedByAssociateId()))
                .toList());
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
        if (actorId != null) {
            associateRepository.deleteById(actorId);
        }
    }

    // settings_audit_log.changed_by_associate_id is a real FK to associate(id) (V12), so the
    // actor passed to decide() must be a persisted associate row, not just any UUID.
    private UUID seedAdminActor() {
        UUID id = UUID.randomUUID();
        Associate admin = new Associate();
        admin.setId(id);
        admin.setName("Test Admin");
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setJoinedAt(Instant.now());
        admin.setCumulativeMatchedVolume(BigDecimal.ZERO);
        admin.setUserId("admin-" + id);
        admin.setEmail(id + "@test.local");
        admin.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        admin.setRole(AssociateRole.ADMIN);
        associateRepository.saveAndFlush(admin);
        return id;
    }

    private UUID seedAssociateWithDocument(String userId, KycStatus kycStatus) {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName(userId);
        associate.setKycStatus(kycStatus);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setRankId(SILVER_RANK_ID);
        associate.setUserId(userId);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        associateRepository.saveAndFlush(associate);

        AssociateKycDocument document = new AssociateKycDocument();
        document.setId(UUID.randomUUID());
        document.setAssociateId(id);
        document.setDocumentType("PAN");
        document.setContent(new byte[] {1, 2, 3});
        document.setContentType("image/png");
        document.setUploadedAt(Instant.now());
        associateKycDocumentRepository.saveAndFlush(document);

        return id;
    }

    @Test
    void decideApprovesWithoutThrowingAndRecordsTheAuditRowWithTheKycSection() {
        actorId = seedAdminActor();
        associateId = seedAssociateWithDocument("VP90001", KycStatus.PENDING);

        KycQueueEntryResponse response = kycReviewService.decide(
            associateId, new KycDecisionRequest(KycStatus.VERIFIED, null), actorId);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);

        List<SettingsAuditLog> auditRows = settingsAuditLogRepository.findAll().stream()
            .filter(row -> actorId.equals(row.getChangedByAssociateId()))
            .toList();
        assertThat(auditRows).hasSize(1);
        assertThat(auditRows.get(0).getSection()).isEqualTo("KYC");
        assertThat(auditRows.get(0).getSummary()).contains("VP90001");
    }

    @Test
    void decideRejectsWithoutThrowingAndRecordsTheAuditRowWithTheKycSection() {
        actorId = seedAdminActor();
        associateId = seedAssociateWithDocument("VP90002", KycStatus.PENDING);

        KycQueueEntryResponse response = kycReviewService.decide(
            associateId, new KycDecisionRequest(KycStatus.REJECTED, "Blurry PAN photo"), actorId);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.REJECTED);

        List<SettingsAuditLog> auditRows = settingsAuditLogRepository.findAll().stream()
            .filter(row -> actorId.equals(row.getChangedByAssociateId()))
            .toList();
        assertThat(auditRows).hasSize(1);
        assertThat(auditRows.get(0).getSection()).isEqualTo("KYC");
    }

    @Test
    void listExcludesAZeroDocumentAssociateAndIncludesOneWithADocument() {
        associateId = seedAssociateWithDocument("VP90003", KycStatus.PENDING);
        UUID zeroDocumentAssociateId = UUID.randomUUID();
        Associate zeroDocumentAssociate = new Associate();
        zeroDocumentAssociate.setId(zeroDocumentAssociateId);
        zeroDocumentAssociate.setName("VP90004");
        zeroDocumentAssociate.setKycStatus(KycStatus.PENDING);
        zeroDocumentAssociate.setJoinedAt(Instant.now());
        zeroDocumentAssociate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        zeroDocumentAssociate.setRankId(SILVER_RANK_ID);
        zeroDocumentAssociate.setUserId("VP90004");
        zeroDocumentAssociate.setEmail(zeroDocumentAssociateId + "@test.local");
        zeroDocumentAssociate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        zeroDocumentAssociate.setRole(AssociateRole.ASSOCIATE);
        associateRepository.saveAndFlush(zeroDocumentAssociate);

        try {
            KycPageResponse page = kycReviewService.list(KycStatus.PENDING, 0, 200);

            List<String> userIds = page.entries().stream().map(KycQueueEntryResponse::userId).toList();
            assertThat(userIds).contains("VP90003");
            assertThat(userIds).doesNotContain("VP90004");
        } finally {
            associateRepository.deleteById(zeroDocumentAssociateId);
        }
    }
}
